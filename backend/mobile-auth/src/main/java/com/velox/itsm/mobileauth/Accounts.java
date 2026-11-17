package com.velox.itsm.mobileauth;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.hibernate.SessionFactory;
import org.json.JSONArray;
import org.json.JSONObject;

/** Legacy identity is read-only. Task writes use the shared SCM mapping and the scoped connection. */
public final class Accounts {
    private static final String READ = "SELECT l.LOGINID, l.USERNAME, l.FULL_NAME, l.ROLE_TYPE, l.DESIGNATION, l.LOGIN_TYPE, l.EMAIL, l.PHONE,"
        + " c.COMPANY_CODE, c.COMPANY_NAME, m.PASSWORD_HASH, m.MFA_MODE, m.TOTP_ENCRYPTED, m.REVISION,"
        + " EXISTS(SELECT 1 FROM scm_mobile_project_access a WHERE a.LOGIN_ID=m.LOGIN_ID AND a.COMPANY_CODE=m.COMPANY_CODE) AS PROJECT_ACCESS,"
        + " EXISTS(SELECT 1 FROM scm_mobile_task_access a WHERE a.LOGIN_ID=m.LOGIN_ID AND a.COMPANY_CODE=m.COMPANY_CODE) AS TASK_ACCESS"
        + " FROM scm_mobile_account m JOIN LOGINMASTER l ON l.LOGINID=m.LOGIN_ID"
        + " JOIN company_code_master c ON c.COMPANY_CODE=m.COMPANY_CODE AND c.COMPANY_NAME=l.COMPANY"
        + " WHERE m.ENABLED=TRUE AND ";
    private final DataSource source;
    private final Supplier<SessionFactory> legacySessions;

    public Accounts(DataSource source, Supplier<SessionFactory> legacySessions) {
        this.source = source;
        this.legacySessions = legacySessions;
    }

    Account find(String company, String username) throws SQLException {
        try (Connection db = source.getConnection(); PreparedStatement statement = db.prepareStatement(READ + "c.COMPANY_CODE=? AND l.USERNAME=?")) {
            statement.setString(1, company); statement.setString(2, username);
            return one(statement);
        }
    }

    Account get(int id, String company) throws SQLException {
        try (Connection db = source.getConnection(); PreparedStatement statement = db.prepareStatement(READ + "m.LOGIN_ID=? AND c.COMPANY_CODE=?")) {
            statement.setInt(1, id); statement.setString(2, company);
            return one(statement);
        }
    }

    JSONObject workspace(Account account) throws SQLException {
        try (Connection db = source.getConnection()) {
            return PersonalIncidents.read(db, account.username, account.companyName);
        }
    }

    JSONObject profile(Account account) throws SQLException {
        try (Connection db = source.getConnection(); PreparedStatement query = db.prepareStatement(
                "SELECT EMAIL, PHONE, LOCATION, BRANCH, DEPARTMENT, SUB_DEPARTMENT FROM LOGINMASTER WHERE LOGINID=? AND COMPANY=?")) {
            query.setInt(1, account.id);
            query.setString(2, account.companyName);
            try (ResultSet row = query.executeQuery()) {
                if (!row.next()) return null;
                return new JSONObject().put("kind", "profile")
                    .put("email", Account.clean(row, "EMAIL")).put("phone", Account.clean(row, "PHONE"))
                    .put("location", Account.clean(row, "LOCATION")).put("site", Account.clean(row, "BRANCH"))
                    .put("department", Account.clean(row, "DEPARTMENT")).put("subdepartment", Account.clean(row, "SUB_DEPARTMENT"));
            }
        }
    }

    JSONObject projects(Account account, JSONObject input, String action) throws SQLException {
        try (Connection db = source.getConnection()) {
            switch (action) {
                case "projects/detail": return Projects.detail(db, account, input.getInt("id"));
                case "projects/records": return Projects.records(db, account, input.getInt("id"));
                case "projects/tasks": return AssignedTasks.projectPage(db, account, input);
                case "projects/favorite": return Projects.favorite(db, account, input.getInt("id"), input.getBoolean("favorite"));
                default: return Projects.page(db, account, input);
            }
        }
    }

    JSONObject assignedTasks(Account account, int before, String action) throws SQLException {
        try (Connection db = source.getConnection()) {
            return AssignedTasks.read(db, account, before, action);
        }
    }

    JSONObject workLog(Account account, int taskId, String today) throws SQLException {
        try (Connection db = source.getConnection()) {
            return AssignedTasks.workLog(db, account, taskId, today);
        }
    }

    TaskProgress.Result updateTask(Account account, int taskId, String note, LocalDateTime now) throws SQLException {
        try (Connection db = source.getConnection()) {
            return TaskProgress.apply(db, legacySessions.get(), account, taskId, note, now);
        } catch (RuntimeException failure) {
            throw new SQLException("SCM work log service is unavailable", failure);
        }
    }

    private Account one(PreparedStatement statement) throws SQLException {
        try (ResultSet rows = statement.executeQuery()) {
            if (!rows.next()) return null;
            Account user = new Account(rows);
            return !user.valid() || rows.next() ? null : user;
        }
    }

    boolean acceptTotp(Account user, long step, String enrollment) throws SQLException {
        String update = enrollment == null
            ? "UPDATE scm_mobile_account SET LAST_TOTP_STEP=? WHERE LOGIN_ID=? AND COMPANY_CODE=? AND REVISION=? AND ENABLED=TRUE AND LAST_TOTP_STEP<? AND TOTP_ENCRYPTED IS NOT NULL"
            : "UPDATE scm_mobile_account SET LAST_TOTP_STEP=?, TOTP_ENCRYPTED=?, REVISION=REVISION+1 WHERE LOGIN_ID=? AND COMPANY_CODE=? AND REVISION=? AND ENABLED=TRUE AND LAST_TOTP_STEP<? AND TOTP_ENCRYPTED IS NULL";
        try (Connection db = source.getConnection(); PreparedStatement statement = db.prepareStatement(update)) {
            int i = 1;
            statement.setLong(i++, step);
            if (enrollment != null) statement.setString(i++, enrollment);
            statement.setInt(i++, user.id); statement.setString(i++, user.companyCode); statement.setLong(i++, user.revision); statement.setLong(i, step);
            return statement.executeUpdate() == 1;
        }
    }

    boolean reset(Account user, String passwordHash) throws SQLException {
        try (Connection db = source.getConnection(); PreparedStatement statement = db.prepareStatement(
                "UPDATE scm_mobile_account SET PASSWORD_HASH=?, REVISION=REVISION+1 WHERE LOGIN_ID=? AND COMPANY_CODE=? AND REVISION=? AND ENABLED=TRUE")) {
            statement.setString(1, passwordHash); statement.setInt(2, user.id); statement.setString(3, user.companyCode); statement.setLong(4, user.revision);
            return statement.executeUpdate() == 1;
        }
    }

    static final class Account {
        final int id;
        final long revision;
        final boolean projectAccess;
        final boolean taskAccess;
        final String username, fullname, role, designation, companyCode, companyName, email, phone, kind, mode, passwordHash, totp;
        Account(ResultSet data) throws SQLException {
            id = data.getInt("LOGINID"); revision = data.getLong("REVISION");
            projectAccess = data.getBoolean("PROJECT_ACCESS");
            taskAccess = data.getBoolean("TASK_ACCESS");
            username = clean(data, "USERNAME"); fullname = clean(data, "FULL_NAME"); role = clean(data, "ROLE_TYPE");
            designation = clean(data, "DESIGNATION"); companyCode = clean(data, "COMPANY_CODE"); companyName = clean(data, "COMPANY_NAME");
            email = clean(data, "EMAIL"); phone = clean(data, "PHONE"); kind = clean(data, "LOGIN_TYPE"); mode = clean(data, "MFA_MODE");
            passwordHash = data.getString("PASSWORD_HASH"); totp = data.getString("TOTP_ENCRYPTED");
        }
        private boolean valid() {
            return id > 0 && revision > 0 && label(username, 128) && label(fullname, 128) && label(role, 96) && designation.length() <= 128
                && label(companyCode, 48) && label(companyName, 128) && (directory() || "non-ad".equalsIgnoreCase(kind))
                && ("off".equals(mode) || "sms".equals(mode) || "totp".equals(mode));
        }
        boolean directory() { return "AD".equalsIgnoreCase(kind); }
        JSONObject identity() {
            JSONArray capabilities = new JSONArray();
            if (projectAccess) capabilities.put("projects.read");
            if (taskAccess) capabilities.put("tasks.assigned-by-me").put("tasks.assigned-to-me");
            return new JSONObject().put("username", username).put("displayName", fullname).put("role", role).put("designation", designation)
                .put("companyCode", companyCode).put("companyName", companyName).put("capabilities", capabilities);
        }
        private static String clean(ResultSet source, String key) throws SQLException {
            String value = source.getString(key);
            return value == null ? "" : value.trim();
        }
        private static boolean label(String value, int max) { return !value.isEmpty() && value.length() <= max; }
    }
}
