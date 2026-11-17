package com.velox.itsm.mobileauth;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

final class AssignedTasks {
    private static final int PAGE_SIZE = 30;
    private static final String SCOPED =
        " FROM scm_mobile_task_access a JOIN DaywiseTask t ON t.SR_NO=a.TASK_ID WHERE a.LOGIN_ID=? AND a.COMPANY_CODE=?";
    private static final String OPEN = " AND t.DEVELOPER_NAME=? AND t.STATUS='Pending'"
        + " AND (t.updateDate_Status IS NULL OR t.updateDate_Status='' OR t.updateDate_Status='Date Approved')";
    private static final String TASK_FIELDS = "SELECT t.SR_NO, t.STATUS, t.CUSTOMERNAME, t.PRODUCTSUIT, t.PRODUCTTOOL,"
        + " t.DESCRIPTION, t.MODULE_NAME, t.TEAM_LEADER, t.DEVELOPER_NAME, t.ASSIGNBY, t.START_DATE, t.END_DATE";
    private static final int LOG_LIMIT = 20;

    private AssignedTasks() {}

    static boolean validId(Object value) {
        if (!(value instanceof Number)) return false;
        double id = ((Number)value).doubleValue();
        return id >= 1 && id <= Integer.MAX_VALUE && id == Math.rint(id);
    }

    static JSONObject read(Connection db, Accounts.Account account, int before, boolean incoming) throws SQLException {
        String sql = TASK_FIELDS + SCOPED + (incoming ? OPEN : " AND t.ASSIGNBY=?")
            + (before == 0 ? "" : " AND t.SR_NO<?") + " ORDER BY t.SR_NO DESC LIMIT " + (PAGE_SIZE + 1);
        try (PreparedStatement query = db.prepareStatement(sql)) {
            bind(query, account);
            if (before != 0) query.setInt(4, before);
            return page(query);
        }
    }

    static JSONObject projectPage(Connection db, Accounts.Account account, JSONObject input) throws SQLException {
        int id = input.getInt("id");
        if (Projects.detail(db, account, id) == null) return null;
        String term = input.optString("query").trim().toLowerCase(Locale.ROOT);
        boolean hasFilter = !term.isEmpty();
        boolean hasCursor = input.has("before");
        String sql = TASK_FIELDS + " FROM scm_mobile_project_access p"
            + " JOIN ProjectData project ON project.SR_NO=p.PROJECT_ID"
            + " JOIN scm_mobile_project_task l ON l.PROJECT_ID=p.PROJECT_ID AND l.COMPANY_CODE=p.COMPANY_CODE"
            + " JOIN scm_mobile_task_access a ON a.TASK_ID=l.TASK_ID AND a.COMPANY_CODE=p.COMPANY_CODE AND a.LOGIN_ID=p.LOGIN_ID"
            + " JOIN DaywiseTask t ON t.SR_NO=a.TASK_ID"
            + " WHERE p.LOGIN_ID=? AND p.COMPANY_CODE=? AND p.PROJECT_ID=? AND (t.DEVELOPER_NAME=? OR t.ASSIGNBY=?)"
            + (hasCursor ? " AND t.SR_NO<?" : "")
            + (hasFilter ? " AND (LOWER(t.MODULE_NAME) LIKE ? ESCAPE '!' OR LOWER(t.DESCRIPTION) LIKE ? ESCAPE '!'"
                + " OR LOWER(t.DEVELOPER_NAME) LIKE ? ESCAPE '!' OR LOWER(t.STATUS) LIKE ? ESCAPE '!')" : "")
            + " ORDER BY t.SR_NO DESC LIMIT " + (PAGE_SIZE + 1);
        try (PreparedStatement query = db.prepareStatement(sql)) {
            query.setInt(1, account.id);
            query.setString(2, account.companyCode);
            query.setInt(3, id);
            query.setString(4, account.fullname);
            query.setString(5, account.fullname);
            int parameter = 6;
            if (hasCursor) query.setInt(parameter++, input.getInt("before"));
            if (hasFilter) {
                String pattern = "%" + term.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
                for (int i = 0; i < 4; i++) query.setString(parameter++, pattern);
            }
            return page(query).put("projectId", id);
        }
    }

    private static JSONObject page(PreparedStatement query) throws SQLException {
        try (ResultSet rows = query.executeQuery()) {
            JSONArray items = new JSONArray();
            int last = 0;
            while (items.length() < PAGE_SIZE && rows.next()) {
                last = rows.getInt("SR_NO");
                items.put(new JSONObject().put("id", last)
                    .put("module", label(rows, "MODULE_NAME")).put("status", label(rows, "STATUS"))
                    .put("customer", label(rows, "CUSTOMERNAME")).put("suite", label(rows, "PRODUCTSUIT"))
                    .put("tool", label(rows, "PRODUCTTOOL")).put("description", label(rows, "DESCRIPTION"))
                    .put("lead", label(rows, "TEAM_LEADER")).put("developer", label(rows, "DEVELOPER_NAME"))
                    .put("assigner", label(rows, "ASSIGNBY")).put("start", label(rows, "START_DATE")).put("due", label(rows, "END_DATE")));
            }
            Object next = items.length() == PAGE_SIZE && rows.next() ? last : JSONObject.NULL;
            return new JSONObject().put("kind", "assigned-tasks").put("items", items).put("next", next);
        }
    }

    static JSONObject workLog(Connection db, Accounts.Account account, int id) throws SQLException {
        String authorized = "SELECT t.SR_NO" + SCOPED + OPEN + " AND t.SR_NO=?";
        try (PreparedStatement query = db.prepareStatement(authorized)) {
            bind(query, account);
            query.setInt(4, id);
            try (ResultSet row = query.executeQuery()) {
                if (!row.next()) return null;
            }
        }
        String sql = "SELECT w.SR_NO, w.DATE, w.TODAYS_PROGRESS, w.STATUS, w.FULL_NAME FROM Update_Todays_Progress w"
            + " WHERE w.TASK_ID=? AND w.TASK_TYPE='General' AND EXISTS (" + authorized + ")"
            + " ORDER BY w.SR_NO DESC LIMIT " + (LOG_LIMIT + 1);
        try (PreparedStatement query = db.prepareStatement(sql)) {
            query.setString(1, Integer.toString(id));
            query.setInt(2, account.id);
            query.setString(3, account.companyCode);
            query.setString(4, account.fullname);
            query.setInt(5, id);
            try (ResultSet rows = query.executeQuery()) {
                JSONArray items = new JSONArray();
                while (items.length() < LOG_LIMIT && rows.next()) {
                    items.put(new JSONObject().put("id", rows.getInt("SR_NO")).put("date", label(rows, "DATE"))
                        .put("note", label(rows, "TODAYS_PROGRESS")).put("status", label(rows, "STATUS"))
                        .put("author", label(rows, "FULL_NAME")));
                }
                return new JSONObject().put("kind", "task-work-log").put("taskId", id)
                    .put("items", items).put("hasMore", items.length() == LOG_LIMIT && rows.next());
            }
        }
    }

    private static void bind(PreparedStatement query, Accounts.Account account) throws SQLException {
        query.setInt(1, account.id);
        query.setString(2, account.companyCode);
        query.setString(3, account.fullname);
    }

    private static String label(ResultSet row, String column) throws SQLException {
        String value = row.getString(column);
        return value == null ? "" : value.trim();
    }
}
