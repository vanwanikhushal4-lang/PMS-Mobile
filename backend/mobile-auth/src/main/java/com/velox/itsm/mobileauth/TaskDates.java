package com.velox.itsm.mobileauth;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.Transaction;
import org.hibernate.metadata.ClassMetadata;
import org.json.JSONArray;
import org.json.JSONObject;
import org.springframework.web.util.HtmlUtils;

final class TaskDates {
    static final String AWAITING = "Pending for approval";
    static final String APPROVED = "Date Approved";
    static final String WAITING = "t.updateDate_Status='" + AWAITING + "'";
    private static final String PARTICIPANT = " AND ? IN (t.DEVELOPER_NAME,t.TEAM_LEADER,t.MANAGER_NAME)";
    private static final String SCOPED_TASK = AssignedTasks.SCOPED + PARTICIPANT + " AND t.SR_NO=?";
    private static final String SELECT = "SELECT t.STATUS,t.DEVELOPER_NAME,t.TEAM_LEADER,t.MANAGER_NAME,t.START_DATE,t.END_DATE,"
        + "t.updateDate_Status,t.updateStarts_Date,t.updateEnd_Date,t.updateDates_Reason,t.updateTimeDate,t.updateDateCount,t.dateUpdateBy"
        + SCOPED_TASK;
    private static final String HISTORY_ENTITY = "com.velox.itsm.model.ReviseDateHistory";
    private static final int HISTORY_LIMIT = 20;

    private TaskDates() {}

    enum Result { SAVED, MISSING, CHANGED, INVALID_RANGE, NO_REVIEWER }

    static boolean managerRoute(Accounts.Account account) {
        return "Implementor".equalsIgnoreCase(account.role)
            || "Support_Manager".equalsIgnoreCase(account.role)
            || "Support Manager".equalsIgnoreCase(account.role);
    }

    static JSONObject detail(Connection db, Accounts.Account account, int id) throws SQLException {
        Schedule schedule = load(db, account, id, false);
        if (schedule == null) return null;
        JSONObject data = new JSONObject().put("kind", "task-dates").put("taskId", id)
            .put("start", schedule.start).put("due", schedule.due).put("approval", schedule.approval)
            .put("requestMode", schedule.requestMode(account)).put("canApprove", schedule.canApprove(account))
            .put("requestedStart", schedule.awaiting() ? schedule.requestedStart : "")
            .put("requestedDue", schedule.awaiting() ? schedule.requestedDue : "")
            .put("reason", schedule.awaiting() ? HtmlUtils.htmlUnescape(schedule.reason) : "")
            .put("revision", schedule.awaiting() ? schedule.revision(id) : JSONObject.NULL);
        JSONArray history = new JSONArray();
        try (PreparedStatement query = db.prepareStatement(
                "SELECT SR_NO, START_DATE, REVISE_START_DATE, END_DATE, REVISE_END_DATE, APPROVED_DATE, APPROVED_BY, REVISE_REASON"
                + " FROM ReviseDateHistory WHERE TASK_ID=? AND EXISTS (SELECT t.SR_NO" + SCOPED_TASK
                + ") ORDER BY SR_NO DESC LIMIT " + (HISTORY_LIMIT + 1))) {
            query.setString(1, Integer.toString(id));
            query.setInt(2, account.id);
            query.setString(3, account.companyCode);
            query.setString(4, account.fullname);
            query.setInt(5, id);
            try (ResultSet rows = query.executeQuery()) {
                while (history.length() < HISTORY_LIMIT && rows.next()) {
                    history.put(new JSONObject().put("id", rows.getInt("SR_NO"))
                        .put("start", value(rows, "START_DATE")).put("due", value(rows, "END_DATE"))
                        .put("revisedStart", value(rows, "REVISE_START_DATE")).put("revisedDue", value(rows, "REVISE_END_DATE"))
                        .put("approvedAt", value(rows, "APPROVED_DATE")).put("by", value(rows, "APPROVED_BY"))
                        .put("reason", HtmlUtils.htmlUnescape(value(rows, "REVISE_REASON"))));
                }
                return data.put("history", history).put("hasMore", history.length() == HISTORY_LIMIT && rows.next());
            }
        }
    }

    static Result request(Connection db, Accounts.Account account, int id, LocalDate start, LocalDate due,
                          String reason, LocalDateTime now) throws SQLException {
        db.setAutoCommit(false);
        try {
            Schedule row = load(db, account, id, true);
            Result result = row == null ? Result.MISSING : requestLocked(db, account, id, row, start, due, reason, now);
            db.commit();
            return result;
        } catch (SQLException | RuntimeException failure) {
            db.rollback();
            throw failure;
        }
    }

    private static Result requestLocked(Connection db, Accounts.Account account, int id, Schedule row,
                                        LocalDate start, LocalDate due, String reason, LocalDateTime now) throws SQLException {
        String mode = row.requestMode(account);
        if (!row.isAssignee(account) && !row.isTeamLead(account)) return Result.MISSING;
        if ("none".equals(mode)) return Result.CHANGED;
        if (start != null && !"schedule".equals(mode)) return Result.MISSING;
        if (start != null && reason.isEmpty()) return Result.INVALID_RANGE;
        LocalDate existingStart = parse(row.start);
        LocalDate effectiveStart = start == null ? existingStart : start;
        if ((effectiveStart != null && due.isBefore(effectiveStart))
            || (due.equals(parse(row.due)) && (start == null || start.equals(existingStart)))) return Result.INVALID_RANGE;
        if (!row.hasReviewer(start != null, account)) return Result.NO_REVIEWER;
        try (PreparedStatement write = db.prepareStatement(
                "UPDATE DaywiseTask SET updateStarts_Date=?,updateEnd_Date=?,updateDates_Reason=?,updateTimeDate=?,"
                + "dateUpdateBy=?,updateDate_Status=? WHERE SR_NO=?")) {
            write.setString(1, start == null ? null : TaskProgress.date(start.atStartOfDay()));
            write.setString(2, TaskProgress.date(due.atStartOfDay()));
            write.setString(3, reason);
            write.setString(4, TaskProgress.timestamp(now));
            write.setString(5, account.fullname);
            write.setString(6, AWAITING);
            write.setInt(7, id);
            if (write.executeUpdate() != 1) throw new SQLException("SCM date request was not saved");
        }
        return Result.SAVED;
    }

    @SuppressWarnings("deprecation")
    static Result approve(Connection db, SessionFactory factory, Accounts.Account account, int id, String revision,
                          LocalDateTime now) throws SQLException {
        try (Session session = factory.withOptions().connection(db).openSession()) {
            Transaction transaction = session.beginTransaction();
            try {
                Schedule row = load(db, account, id, true);
                Result result;
                if (row == null || !row.isReviewer(account)) result = Result.MISSING;
                else if (!row.awaiting() || !revision.equals(row.revision(id))) result = Result.CHANGED;
                else if (!row.canApprove(account)) result = Result.INVALID_RANGE;
                else {
                    updateDates(db, id, row, now);
                    ClassMetadata mapping = factory.getClassMetadata(HISTORY_ENTITY);
                    Object history = LegacyRecord.create(mapping);
                    mapping.setPropertyValue(history, "TASK_ID", Integer.toString(id));
                    mapping.setPropertyValue(history, "START_DATE", row.start);
                    mapping.setPropertyValue(history, "END_DATE", row.due);
                    mapping.setPropertyValue(history, "REVISE_START_DATE", row.newStart());
                    mapping.setPropertyValue(history, "REVISE_END_DATE", row.requestedDue);
                    mapping.setPropertyValue(history, "APPROVED_DATE", now.toLocalDate().toString());
                    mapping.setPropertyValue(history, "APPROVED_BY", account.fullname);
                    mapping.setPropertyValue(history, "REVISE_REASON", encodeReason(HtmlUtils.htmlUnescape(row.reason)));
                    session.save(HISTORY_ENTITY, history);
                    session.flush();
                    result = Result.SAVED;
                }
                transaction.commit();
                return result;
            } catch (SQLException | RuntimeException failure) {
                if (transaction.getStatus().canRollback()) transaction.rollback();
                if (failure instanceof SQLException) throw (SQLException) failure;
                throw new SQLException("SCM date approval failed", failure);
            }
        }
    }

    private static void updateDates(Connection db, int id, Schedule row, LocalDateTime now) throws SQLException {
        // The JSP increments the count either when an assignee requests a date or when a manager approves it.
        // Our writes count exactly once on approval. Older end-date requests may already have applied the date.
        boolean countDueChange = row.requestedStart.isEmpty() && !parse(row.requestedDue).equals(parse(row.due));
        try (PreparedStatement write = db.prepareStatement(
                "UPDATE DaywiseTask SET START_DATE=COALESCE(?,START_DATE),END_DATE=?,updateTimeDate=?,updateDate_Status=?,updateDateCount=? WHERE SR_NO=?")) {
            write.setString(1, row.requestedStart.isEmpty() ? null : row.requestedStart);
            write.setString(2, row.requestedDue);
            write.setString(3, TaskProgress.timestamp(now));
            write.setString(4, APPROVED);
            write.setString(5, countDueChange ? incrementCount(row.count) : row.count);
            write.setInt(6, id);
            if (write.executeUpdate() != 1) throw new SQLException("SCM dates were not updated");
        }
    }

    private static String incrementCount(String value) {
        try { return Long.toString(Math.min(Integer.MAX_VALUE, Math.max(0L, Integer.parseInt(value)) + 1)); }
        catch (NumberFormatException ignored) { return "1"; }
    }

    private static Schedule load(Connection db, Accounts.Account account, int id, boolean lock) throws SQLException {
        try (PreparedStatement query = db.prepareStatement(SELECT + (lock ? " FOR UPDATE" : ""))) {
            AssignedTasks.bind(query, account);
            query.setInt(4, id);
            try (ResultSet row = query.executeQuery()) {
                return row.next() ? new Schedule(row) : null;
            }
        }
    }

    static LocalDate parse(String date) {
        if (date == null) return null;
        String input = date.trim();
        try {
            if (input.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return bounded(LocalDate.parse(input));
            if (input.matches("[0-9]{1,2}[.][0-9]{1,2}[.][0-9]{4}")) {
                String[] parts = input.split("[.]");
                return bounded(LocalDate.of(Integer.parseInt(parts[2]), Integer.parseInt(parts[1]), Integer.parseInt(parts[0])));
            }
            return null;
        } catch (java.time.DateTimeException ignored) { return null; }
    }

    private static LocalDate bounded(LocalDate date) { return date.getYear() >= 1000 ? date : null; }

    static String encodeReason(String value) {
        // Legacy JSP approval and history screens insert this field as HTML.
        return HtmlUtils.htmlEscape(value, "UTF-8");
    }

    private static String value(ResultSet row, String name) throws SQLException {
        String raw = row.getString(name);
        return raw == null ? "" : raw.trim();
    }

    private static final class Schedule {
        final String status, assignee, lead, manager, start, due, approval, requestedStart, requestedDue, reason, changedAt, count, requester;

        Schedule(ResultSet row) throws SQLException {
            status = value(row, "STATUS");
            assignee = value(row, "DEVELOPER_NAME");
            lead = value(row, "TEAM_LEADER");
            manager = value(row, "MANAGER_NAME");
            start = value(row, "START_DATE");
            due = value(row, "END_DATE");
            approval = value(row, "updateDate_Status");
            requestedStart = value(row, "updateStarts_Date");
            requestedDue = value(row, "updateEnd_Date");
            reason = value(row, "updateDates_Reason");
            changedAt = value(row, "updateTimeDate");
            count = row.getString("updateDateCount");
            requester = value(row, "dateUpdateBy");
        }

        boolean awaiting() { return AWAITING.equalsIgnoreCase(approval); }
        boolean isAssignee(Accounts.Account user) { return user.fullname.equalsIgnoreCase(assignee); }
        boolean isTeamLead(Accounts.Account user) { return !managerRoute(user) && user.fullname.equalsIgnoreCase(lead); }

        String requestMode(Accounts.Account user) {
            if (!"Pending".equalsIgnoreCase(status) || !(approval.isEmpty() || APPROVED.equalsIgnoreCase(approval))) return "none";
            if (isTeamLead(user)) return "schedule";
            return isAssignee(user) ? "due" : "none";
        }

        boolean hasReviewer(boolean changesStart, Accounts.Account user) {
            if (!manager.isEmpty() && !user.fullname.equalsIgnoreCase(manager) && !manager.equalsIgnoreCase(assignee)) return true;
            return !changesStart && !lead.isEmpty() && !user.fullname.equalsIgnoreCase(lead) && !lead.equalsIgnoreCase(assignee);
        }

        boolean isReviewer(Accounts.Account user) {
            return !isAssignee(user) && !user.fullname.equalsIgnoreCase(requester)
                && (user.fullname.equalsIgnoreCase(manager) || (requestedStart.isEmpty() && isTeamLead(user)));
        }

        boolean canApprove(Accounts.Account user) {
            LocalDate from = parse(newStart());
            LocalDate to = parse(requestedDue);
            return "Pending".equalsIgnoreCase(status) && awaiting() && isReviewer(user)
                && to != null && (requestedStart.isEmpty() || from != null) && (from == null || !to.isBefore(from))
                && encodeReason(HtmlUtils.htmlUnescape(reason)).length() <= 255;
        }

        String newStart() { return requestedStart.isEmpty() ? start : requestedStart; }

        String revision(int id) {
            return Secrets.tokenHash(new JSONArray().put(id).put(status).put(approval).put(assignee).put(lead).put(manager)
                .put(start).put(due).put(requestedStart).put(requestedDue).put(reason).put(changedAt).put(requester).toString());
        }
    }
}
