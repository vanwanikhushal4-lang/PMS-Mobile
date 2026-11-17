#!/usr/bin/env bash
# Build and exercise the same Spring controller in a private Tomcat with H2 staging identities.
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/.." && pwd)
module="$root/backend/mobile-auth"
legacy_lib=${SCM_LEGACY_LIB_DIR:-"$root/.scm-runtime/tomcat/webapps/SCM/WEB-INF/lib"}
tomcat=${SCM_TOMCAT_HOME:-"$root/.scm-runtime/apache-tomcat-9.0.123"}
h2=${SCM_H2_JAR:-"$HOME/.m2/repository/com/h2database/h2/2.1.214/h2-2.1.214.jar"}
[[ -f "$h2" && -f "$tomcat/bin/catalina.sh" && -d "$legacy_lib" ]] || { echo 'Set SCM_H2_JAR, SCM_TOMCAT_HOME, and SCM_LEGACY_LIB_DIR for isolated Java tests' >&2; exit 1; }
mkdir -p "$root/.qa"
base=$(mktemp -d "$root/.qa/mobile-auth-java.XXXXXX")
port=${SCM_AUTH_QA_PORT:-8091}
[[ "$port" =~ ^[0-9]{4,5}$ ]] || { echo 'SCM_AUTH_QA_PORT must be a numeric port' >&2; exit 1; }
pid=''
cleanup() { if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
printf 'Staging output: %s\n' "$base"
"$root/tools/build_mobile_auth.sh" "$base"
mkdir -p "$base"/{conf,logs,temp,work,webapps/scm-auth-qa/WEB-INF/{classes,lib}}
cp -R "$tomcat/conf/." "$base/conf/"
cat > "$base/conf/server.xml" <<CONFIG
<Server port="-1"><Service name="Catalina">
 <Connector address="127.0.0.1" port="$port" protocol="HTTP/1.1" connectionTimeout="5000" />
 <Engine name="Catalina" defaultHost="localhost"><Host name="localhost" appBase="webapps" deployOnStartup="true" autoDeploy="false" /></Engine>
</Service></Server>
CONFIG
war="$base/webapps/scm-auth-qa/WEB-INF"
find "$module/src/test/java" -name '*.java' -print0 | xargs -0 javac --release 8 -cp "$base/scm-mobile-auth.jar:$legacy_lib/*:$h2" -d "$war/classes"
cp "$base/scm-mobile-auth.jar" "$h2" "$war/lib/"
for dep in spring-{aop,beans,context,core,expression,jdbc,tx,web,webmvc}-4.2.5.RELEASE.jar commons-logging-1.2.jar aopalliance-1.0.jar json-20180813.jar; do
 cp "$legacy_lib/$dep" "$war/lib/"
done
cp -R "$base/webapps/scm-auth-qa" "$base/webapps/scm-auth-strict"
cp -R "$base/webapps/scm-auth-qa" "$base/webapps/scm-auth-disabled"
SCM_MOBILE_AUTH_KEY=$(openssl rand -base64 32) SCM_MOBILE_AUTH_JDBC_URL=jdbc:mysql://127.0.0.1:1/unused_stage_schema \
 SCM_MOBILE_AUTH_JDBC_USER=unused_stage_reader SCM_MOBILE_AUTH_JDBC_PASSWORD=not-used-by-the-loopback-test \
 CATALINA_HOME="$tomcat" CATALINA_BASE="$base" CATALINA_OPTS="-Dscm.qa.inbox=$base/inbox.tsv" \
 "$tomcat/bin/catalina.sh" run > "$base/tomcat.log" 2>&1 &
pid=$!
qa="http://127.0.0.1:$port/scm-auth-qa/mobile/v1/auth/"
strict="http://127.0.0.1:$port/scm-auth-strict/mobile/v1/auth/"
disabled="http://127.0.0.1:$port/scm-auth-disabled/mobile/v1/auth/"
for ((i=0; i<50; i++)); do
 kill -0 "$pid" 2>/dev/null || { tail -35 "$base/tomcat.log" >&2; exit 1; }
 [[ $(curl -s -o /dev/null --max-time 2 -w '%{http_code}' "${qa}session") == 401 ]] && break
 if [[ $i == 49 ]]; then tail -35 "$base/tomcat.log" >&2; exit 1; fi
 sleep 0.5
done
if [[ ${SCM_AUTH_QA_SERVE:-0} == 1 ]]; then
 printf 'QA endpoint: %s\nSynthetic delivery inbox: %s\n' "$qa" "$base/inbox.tsv"
 wait "$pid"
else
 java -cp "$war/classes:$war/lib/*:$tomcat/lib/servlet-api.jar" com.velox.itsm.mobileauth.qa.ExpiryCheck "$base/expiry-inbox.tsv"
 SCM_JAVA_QA_ENDPOINT="$qa" SCM_JAVA_STRICT_ENDPOINT="$strict" SCM_JAVA_DISABLED_ENDPOINT="$disabled" SCM_JAVA_QA_INBOX="$base/inbox.tsv" \
  node --test "$module/src/test/auth-http.test.mjs"
 if rg -q 'Stage-only-password-28|Synthetic-AD-only-22|Replacement-mobile-pass|Replacement-phone-pass' "$base/tomcat.log"; then
  echo 'A synthetic secret appeared in Tomcat output' >&2; exit 1
 fi
 echo 'No fixture passwords in Tomcat output.'
fi
