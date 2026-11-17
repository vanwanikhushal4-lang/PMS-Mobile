package com.velox.itsm.mobileauth;

import java.net.URI;
import java.util.Arrays;
import java.util.Base64;
import java.util.Properties;
import org.hibernate.SessionFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@Configuration
@Profile("scm-mobile-auth")
public class AuthConfiguration {
    @Bean(destroyMethod = "close")
    public AuthService mobileAuthService(Environment env, ApplicationContext context) {
        byte[] key;
        try { key = Base64.getDecoder().decode(env.getProperty("SCM_MOBILE_AUTH_KEY", "")); }
        catch (IllegalArgumentException e) { throw new IllegalArgumentException("Invalid mobile auth key configuration"); }
        try {
            Secrets secrets = new Secrets(key);
            return new AuthService(new Accounts(mobileDataSource(env), () -> context.getBean(SessionFactory.class)), secrets,
                Integrations.directory(env.getProperty("SCM_MOBILE_AUTH_AD_URL"), env.getProperty("SCM_MOBILE_AUTH_AD_COMPANY"), env.getProperty("SCM_MOBILE_AUTH_AD_REALM")),
                Integrations.delivery(env.getProperty("SCM_MOBILE_AUTH_DELIVERY_URL"), env.getProperty("SCM_MOBILE_AUTH_DELIVERY_BEARER")),
                System::currentTimeMillis);
        } finally { Arrays.fill(key, (byte)0); }
    }

    private DriverManagerDataSource mobileDataSource(Environment env) {
        String url = env.getProperty("SCM_MOBILE_AUTH_JDBC_URL", "");
        String username = env.getProperty("SCM_MOBILE_AUTH_JDBC_USER", "").trim();
        String password = env.getProperty("SCM_MOBILE_AUTH_JDBC_PASSWORD", "");
        URI target;
        try { target = URI.create(url.startsWith("jdbc:mysql://") ? url.substring(5) : ""); }
        catch (IllegalArgumentException e) { throw new IllegalArgumentException("Invalid mobile auth database configuration"); }
        if (target.getHost() == null || target.getPort() > 65535 || target.getUserInfo() != null || target.getQuery() != null
            || target.getFragment() != null || target.getPath() == null || !target.getPath().matches("/[A-Za-z0-9_]+")
            || username.isEmpty() || "root".equalsIgnoreCase(username) || password.isEmpty()) {
            throw new IllegalArgumentException("Mobile auth requires its own scoped MySQL data source");
        }
        Properties options = new Properties();
        options.setProperty("sslMode", "VERIFY_IDENTITY");
        options.setProperty("connectTimeout", "3000");
        options.setProperty("socketTimeout", "4000");
        DriverManagerDataSource db = new DriverManagerDataSource();
        db.setUrl(url); db.setUsername(username); db.setPassword(password); db.setConnectionProperties(options);
        return db;
    }
}
