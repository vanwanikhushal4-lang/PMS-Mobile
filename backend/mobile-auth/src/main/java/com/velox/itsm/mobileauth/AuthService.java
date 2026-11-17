package com.velox.itsm.mobileauth;

import com.velox.itsm.mobileauth.Accounts.Account;
import java.security.MessageDigest;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.LongSupplier;
import java.util.function.ToLongFunction;
import java.util.logging.Logger;
import org.json.JSONObject;

public final class AuthService implements AutoCloseable {
    private static final long CODE_TTL = 3 * 60000, SESSION_TTL = 30 * 60000, RATE_WINDOW = 5 * 60000;
    private static final Logger LOG = Logger.getLogger(AuthService.class.getName());
    private final Accounts accounts;
    private final Secrets secrets;
    private final Directory directory;
    private final Delivery delivery;
    private final LongSupplier clock;
    private final String dummyHash;
    private final Expiring<Session> sessions = new Expiring<>(10000, item -> item.until);
    private final Expiring<Pending> pending = new Expiring<>(5000, item -> item.until);
    private final Expiring<Reset> resets = new Expiring<>(2000, item -> item.until);
    private final Expiring<Attempts> limits = new Expiring<>(20000, item -> item.until);
    private final ThreadPoolExecutor recoveryDelivery = new ThreadPoolExecutor(1, 2, 20, TimeUnit.SECONDS, new ArrayBlockingQueue<>(64), task -> {
        Thread thread = new Thread(task, "scm-mobile-recovery"); thread.setDaemon(true); return thread;
    });

    public AuthService(Accounts accounts, Secrets secrets, Directory directory, Delivery delivery, LongSupplier clock) {
        this.accounts = accounts; this.secrets = secrets; this.directory = directory; this.delivery = delivery; this.clock = clock;
        dummyHash = secrets.passwordHash(secrets.token());
    }

    public interface Directory { boolean verify(String company, String username, String password) throws Unavailable; }
    public interface Delivery { void send(String channel, String destination, String code) throws Unavailable; }
    public static final class Unavailable extends Exception { public Unavailable() { super("Configured authentication service is unavailable"); } }
    @Override public void close() { recoveryDelivery.shutdownNow(); }

    public Reply dispatch(String action, JSONObject input, String bearer, String remote) throws SQLException, Unavailable {
        long now = clock.getAsLong();
        switch (action) {
            case "session": case "sign-out": case "workspace": case "profile":
            case "projects/list": case "projects/detail": case "projects/records":
            case "tasks/assigned-by-me": case "tasks/assigned-to-me": case "tasks/work-log":
                return session(action, input, bearer, now);
            default: break;
        }
        if (!take("request/" + remote, 70, now)) return rejected(429, "rate-limited");
        switch (action) {
            case "sign-in": return signIn(input, remote, now);
            case "challenge/verify": return verify(input, false, now);
            case "challenge/resend": return resend(input, now);
            case "recovery/start": return startRecovery(input, remote, now);
            case "recovery/verify": return verify(input, true, now);
            case "recovery/complete": return completeRecovery(input, now);
            default: return rejected(404, "account-unavailable");
        }
    }

    private Reply signIn(JSONObject data, String remote, long now) throws SQLException, Unavailable {
        String company = string(data, "companyCode", 48).trim();
        String username = string(data, "username", 128).trim();
        String password = string(data, "password", 512);
        if (company.isEmpty() || username.isEmpty() || password.isEmpty()) return rejected(401, "invalid-credentials");
        if (!take("login/ip/" + remote, 24, now) || !take("login/account/" + accountLimit(company, username), 8, now))
            return rejected(429, "rate-limited");
        Account account = accounts.find(company, username);
        if (account != null && account.directory()) {
            if (!directory.verify(account.companyCode, account.username, password)) return rejected(401, "invalid-credentials");
        } else {
            String hash = account == null || account.passwordHash == null ? dummyHash : account.passwordHash;
            if (!secrets.passwordMatches(password, hash) || account == null || account.passwordHash == null) return rejected(401, "invalid-credentials");
        }
        if ("off".equals(account.mode)) return issue(account, now);
        if ("sms".equals(account.mode)) {
            if (!phone(account.phone)) return rejected(409, "account-unavailable");
            return delivered(account, "sms", false, true, now);
        }
        String token = secrets.token();
        String enrollment = account.totp == null ? secrets.newTotpSecret() : null;
        Pending item = new Pending(account, "totp", false, now + CODE_TTL, null, enrollment, false);
        if (!pending.put(Secrets.tokenHash(token), item, now)) return rejected(503, "account-unavailable");
        return enrollment == null ? challenge(token, item, account) : reply(202, new JSONObject().put("kind", "enrollment")
            .put("method", "totp").put("challengeId", token).put("expiresAt", item.until)
            .put("setupUri", Secrets.enrollmentUri(account.companyName, account.username, enrollment)));
    }

    private Reply delivered(Account account, String channel, boolean recovery, boolean mayResend, long now) throws Unavailable {
        String token = secrets.token();
        String key = Secrets.tokenHash(token);
        String code = secrets.smsCode();
        Pending item = new Pending(account, channel, recovery, now + CODE_TTL, secrets.codeHash(token, code), null, mayResend);
        if (!pending.put(key, item, now)) return rejected(503, "account-unavailable");
        if (recovery) {
            try {
                recoveryDelivery.execute(() -> {
                    if (account == null || pending.get(key, clock.getAsLong()) != item) return;
                    try { delivery.send(channel, item.destination, code); }
                    catch (Unavailable e) { LOG.warning("SCM mobile recovery delivery unavailable"); }
                });
            } catch (RejectedExecutionException e) { LOG.warning("SCM mobile recovery queue unavailable"); }
            return reply(202, new JSONObject().put("kind", "recovery-sent").put("challengeId", token).put("expiresAt", item.until));
        }
        try { delivery.send(channel, item.destination, code); }
        catch (Unavailable e) { pending.remove(key, item); throw e; }
        return challenge(token, item, account);
    }

    private Reply challenge(String token, Pending item, Account account) {
        JSONObject body = new JSONObject().put("kind", "challenge").put("method", item.method)
            .put("challengeId", token).put("expiresAt", item.until).put("canResend", item.mayResend);
        if ("sms".equals(item.method)) body.put("maskedDestination", "•••" + account.phone.substring(account.phone.length() - 3));
        return reply(202, body);
    }

    private Reply verify(JSONObject data, boolean recovery, long now) throws SQLException {
        String token = string(data, "challengeId", 256);
        String key = key(token);
        Pending item = key == null ? null : pending.get(key, now);
        if (item == null || item.recovery != recovery) return rejected(410, "expired");
        synchronized (item) {
            now = clock.getAsLong();
            if (pending.get(key, now) != item) return rejected(410, "expired");
            if (item.attempts >= 5) return rejected(429, "rate-limited");
            item.attempts++;
            String code = string(data, "code", 6);
            Account account = current(item.ref);
            if (!code.matches("[0-9]{6}") || account == null) return rejected(400, "invalid-code");
            if ("totp".equals(item.method)) {
                if (!"totp".equals(account.mode) || (item.enrollment == null && account.totp == null)) return rejected(410, "expired");
                String actual = item.enrollment == null ? secrets.decryptTotp(account.id, account.totp) : item.enrollment;
                long step = Secrets.matchingStep(actual, code, now);
                if (step < 0 || !accounts.acceptTotp(account, step, item.enrollment == null ? null : secrets.encryptTotp(account.id, actual)))
                    return rejected(400, "invalid-code");
                long revision = account.revision + (item.enrollment == null ? 0 : 1);
                account = accounts.get(account.id, account.companyCode);
                if (account == null || account.revision != revision) return rejected(410, "expired");
            } else if (!item.destination.equals(destination(account, item.method))
                || !MessageDigest.isEqual(item.codeHash, secrets.codeHash(token, code))) {
                return rejected(400, "invalid-code");
            }
            pending.remove(key, item);
            if (recovery) {
                String reset = secrets.token();
                long until = now + CODE_TTL;
                if (!resets.put(Secrets.tokenHash(reset), new Reset(new Reference(account), until, item.method, item.destination), now)) return rejected(503, "account-unavailable");
                return reply(200, new JSONObject().put("kind", "recovery-verified").put("resetGrant", reset).put("expiresAt", until));
            }
            return issue(account, now);
        }
    }

    private Reply resend(JSONObject data, long now) throws SQLException, Unavailable {
        String key = key(string(data, "challengeId", 256));
        Pending item = key == null ? null : pending.get(key, now);
        if (item == null) return rejected(410, "expired");
        synchronized (item) {
            now = clock.getAsLong();
            if (pending.get(key, now) != item) return rejected(410, "expired");
            if (item.recovery || !item.mayResend || !"sms".equals(item.method)) return rejected(429, "rate-limited");
            Account account = current(item.ref);
            if (account == null || !"sms".equals(account.mode) || !phone(account.phone)) return rejected(410, "expired");
            Reply next = delivered(account, "sms", false, false, now);
            if (next.status == 202) pending.remove(key, item);
            return next;
        }
    }

    private Reply startRecovery(JSONObject data, String remote, long now) throws SQLException, Unavailable {
        String company = string(data, "companyCode", 48).trim();
        String username = string(data, "username", 128).trim();
        String channel = string(data, "channel", 5);
        if (company.isEmpty() || username.isEmpty() || !("sms".equals(channel) || "email".equals(channel))) return rejected(400, "account-unavailable");
        if (!take("recovery/ip/" + remote, 12, now) || !take("recovery/account/" + accountLimit(company, username), 3, now)) return rejected(429, "rate-limited");
        Account user = accounts.find(company, username);
        if (user != null && (user.directory() || user.passwordHash == null || !("sms".equals(channel) ? phone(user.phone) : email(user.email)))) user = null;
        return delivered(user, channel, true, false, now);
    }

    private Reply completeRecovery(JSONObject data, long now) throws SQLException {
        String key = key(string(data, "resetGrant", 256));
        String password = string(data, "password", 512);
        Reset reset = key == null ? null : resets.get(key, now);
        if (reset == null) return rejected(410, "expired");
        synchronized (reset) {
            if (resets.get(key, clock.getAsLong()) != reset) return rejected(410, "expired");
            if (password.length() < 12) return rejected(400, "password-policy");
            Account account = current(reset.ref);
            if (account == null || account.directory() || !reset.destination.equals(destination(account, reset.channel))) return rejected(410, "expired");
            String changed = secrets.passwordHash(password);
            if (resets.get(key, clock.getAsLong()) != reset || !accounts.reset(account, changed)) return rejected(410, "expired");
            resets.remove(key, reset);
            return reply(200, new JSONObject().put("kind", "password-changed"));
        }
    }

    private Reply session(String action, JSONObject input, String bearer, long now) throws SQLException {
        String key = key(bearer);
        Session item = key == null ? null : sessions.get(key, now);
        if ("sign-out".equals(action)) {
            if (item != null) sessions.remove(key, item);
            return reply(204, null);
        }
        Account account = item == null ? null : current(item.ref);
        if (account == null) {
            if (item != null) sessions.remove(key, item);
            return rejected(401, "expired");
        }
        Reply result;
        switch (action) {
            case "workspace": result = reply(200, accounts.workspace(account)); break;
            case "profile":
                JSONObject profile = accounts.profile(account);
                result = profile == null ? rejected(401, "expired") : reply(200, profile);
                break;
            case "projects/list": case "projects/detail": case "projects/records":
                result = projects(action, input, key, account, now);
                break;
            case "tasks/assigned-by-me": case "tasks/assigned-to-me": case "tasks/work-log":
                result = tasks(action, input, key, account, now);
                break;
            default: result = reply(200, authenticated(account, item.until));
        }
        if (sessions.get(key, clock.getAsLong()) != item) return rejected(401, "expired");
        return result;
    }

    private Reply projects(String action, JSONObject input, String key, Account account, long now) throws SQLException {
        if (!account.projectAccess) return rejected(403, "forbidden");
        if (!take("projects/" + key, 100, now)) return rejected(429, "rate-limited");
        if (!Projects.valid(input, !"projects/list".equals(action))) return rejected(400, "invalid-filter");
        JSONObject projects = accounts.projects(account, input, action);
        return projects == null ? rejected(404, "project-not-found") : reply(200, projects);
    }

    private Reply tasks(String action, JSONObject input, String key, Account account, long now) throws SQLException {
        if (!account.taskAccess) return rejected(403, "forbidden");
        if (!take("tasks/" + key, 100, now)) return rejected(429, "rate-limited");
        if ("tasks/work-log".equals(action)) {
            if (input.length() != 1 || !AssignedTasks.validId(input.opt("id"))) return rejected(400, "invalid-filter");
            JSONObject log = accounts.workLog(account, input.getInt("id"));
            return log == null ? rejected(404, "task-not-found") : reply(200, log);
        }
        int before = 0;
        if (input.length() != 0) {
            if (input.length() != 1 || !AssignedTasks.validId(input.opt("before"))) return rejected(400, "invalid-filter");
            before = input.getInt("before");
        }
        return reply(200, accounts.assignedTasks(account, before, "tasks/assigned-to-me".equals(action)));
    }

    private Reply issue(Account account, long now) throws SQLException {
        account = current(new Reference(account));
        if (account == null) return rejected(410, "expired");
        String token = secrets.token();
        long until = now + SESSION_TTL;
        if (!sessions.put(Secrets.tokenHash(token), new Session(new Reference(account), until), now)) return rejected(503, "account-unavailable");
        return reply(200, authenticated(account, until).put("sessionToken", token));
    }
    private JSONObject authenticated(Account account, long until) {
        return new JSONObject().put("kind", "authenticated").put("identity", account.identity()).put("expiresAt", until);
    }
    private Account current(Reference ref) throws SQLException {
        if (ref == null) return null;
        Account account = accounts.get(ref.id, ref.company);
        return account != null && account.revision == ref.revision ? account : null;
    }
    private boolean take(String key, int max, long now) {
        synchronized (limits) {
            Attempts bucket = limits.get(key, now);
            if (bucket == null) { bucket = new Attempts(now + RATE_WINDOW); if (!limits.put(key, bucket, now)) return false; }
            return ++bucket.count <= max;
        }
    }
    private static String accountLimit(String company, String username) { return Secrets.tokenHash(company.toLowerCase(Locale.ROOT) + "\0" + username.toLowerCase(Locale.ROOT)); }
    private static String string(JSONObject data, String name, int max) {
        Object value = data.opt(name);
        return value instanceof String && ((String)value).length() <= max ? (String)value : "";
    }
    private static String key(String token) { return token != null && token.matches("[A-Za-z0-9_-]{43}") ? Secrets.tokenHash(token) : null; }
    private static boolean phone(String value) { return value.matches("\\+?[0-9]{7,15}"); }
    private static boolean email(String value) { return value.length() <= 254 && value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"); }
    private static String destination(Account account, String channel) { return "sms".equals(channel) ? account.phone : account.email; }
    private static Reply rejected(int status, String reason) { return reply(status, new JSONObject().put("kind", "rejected").put("reason", reason)); }
    private static Reply reply(int status, JSONObject body) { return new Reply(status, body); }

    public static final class Reply {
        public final int status;
        public final JSONObject body;
        Reply(int status, JSONObject body) { this.status = status; this.body = body; }
    }
    private static class Reference {
        final int id; final String company; final long revision;
        Reference(Account account) { id = account.id; company = account.companyCode; revision = account.revision; }
    }
    private static class Session {
        final Reference ref; final long until;
        Session(Reference ref, long until) { this.ref = ref; this.until = until; }
    }
    private static final class Reset extends Session {
        final String channel, destination;
        Reset(Reference ref, long until, String channel, String destination) {
            super(ref, until); this.channel = channel; this.destination = destination;
        }
    }
    private static final class Pending extends Session {
        final String method, enrollment, destination;
        final boolean recovery, mayResend;
        final byte[] codeHash;
        int attempts;
        Pending(Account account, String method, boolean recovery, long until, byte[] codeHash, String enrollment, boolean mayResend) {
            super(account == null ? null : new Reference(account), until);
            this.method = method; this.recovery = recovery; this.codeHash = codeHash; this.enrollment = enrollment; this.mayResend = mayResend;
            this.destination = account == null ? "" : destination(account, method);
        }
    }
    private static final class Attempts {
        final long until; int count;
        Attempts(long until) { this.until = until; }
    }
    private static final class Expiring<T> {
        private final int capacity;
        private final ToLongFunction<T> expiry;
        private final Map<String, T> items = new HashMap<>();
        private long nextPrune;
        Expiring(int capacity, ToLongFunction<T> expiry) { this.capacity = capacity; this.expiry = expiry; }
        synchronized T get(String key, long now) {
            T item = items.get(key);
            if (item != null && expiry.applyAsLong(item) <= now) { items.remove(key); return null; }
            return item;
        }
        synchronized boolean put(String key, T item, long now) {
            if (now >= nextPrune) {
                Iterator<T> iterator = items.values().iterator();
                while (iterator.hasNext()) if (expiry.applyAsLong(iterator.next()) <= now) iterator.remove();
                nextPrune = now + 1000;
            }
            if (items.size() >= capacity) return false;
            return items.putIfAbsent(key, item) == null;
        }
        synchronized void remove(String key, T item) { items.remove(key, item); }
    }
}
