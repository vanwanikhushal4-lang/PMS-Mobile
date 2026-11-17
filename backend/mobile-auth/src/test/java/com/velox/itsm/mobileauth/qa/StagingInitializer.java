package com.velox.itsm.mobileauth.qa;

import com.velox.itsm.mobileauth.Accounts;
import com.velox.itsm.mobileauth.AuthController;
import com.velox.itsm.mobileauth.AuthConfiguration;
import com.velox.itsm.mobileauth.AuthService;
import com.velox.itsm.mobileauth.Secrets;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.Scanner;
import java.util.function.LongSupplier;
import javax.servlet.ServletContext;
import javax.servlet.ServletException;
import org.h2.jdbcx.JdbcDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.servlet.support.AbstractAnnotationConfigDispatcherServletInitializer;

/** Test-only Spring assembly. No external DB, real directory bind or external code delivery. */
public class StagingInitializer extends AbstractAnnotationConfigDispatcherServletInitializer {
    private boolean testDelivery;
    @Override public void onStartup(ServletContext context) throws ServletException {
        testDelivery = "/scm-auth-qa".equals(context.getContextPath());
        if ("/scm-auth-strict".equals(context.getContextPath())) context.setInitParameter("spring.profiles.active", "scm-mobile-auth");
        super.onStartup(context);
    }
    @Override protected Class<?>[] getRootConfigClasses() { return null; }
    @Override protected Class<?>[] getServletConfigClasses() { return new Class<?>[]{ testDelivery ? QA.class : ProductionProfile.class }; }
    @Override protected String[] getServletMappings() { return new String[]{ "/" }; }

    @Configuration @EnableWebMvc
    public static class QA {
        private static final String PASSWORD = "Stage-only-password-28";
        private static final String TOTP = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

        @Bean(destroyMethod = "close") public AuthService stageAuth(ServletContext context) throws Exception {
            return createStage(context.getContextPath(), Paths.get(System.getProperty("scm.qa.inbox")), System::currentTimeMillis);
        }

        static AuthService createStage(String instance, Path inbox, LongSupplier clock) throws Exception {
            byte[] key = new byte[32]; new SecureRandom().nextBytes(key);
            Secrets secrets = new Secrets(key);
            JdbcDataSource db = new JdbcDataSource();
            db.setURL("jdbc:h2:mem:scm" + instance.replace('-', '_').replace('/', '_') + ";MODE=MySQL;DB_CLOSE_DELAY=-1");
            try (Connection connection = db.getConnection(); Statement sql = connection.createStatement()) {
                sql.execute("CREATE TABLE LOGINMASTER (LOGINID INT PRIMARY KEY, USERNAME VARCHAR(128), FULL_NAME VARCHAR(128), ROLE_TYPE VARCHAR(96), DESIGNATION VARCHAR(128), LOGIN_TYPE VARCHAR(12), EMAIL VARCHAR(254), PHONE VARCHAR(16), COMPANY VARCHAR(128), LOCATION VARCHAR(128), BRANCH VARCHAR(128), DEPARTMENT VARCHAR(128), SUB_DEPARTMENT VARCHAR(128))");
                sql.execute("CREATE TABLE company_code_master (COMPANY_NAME VARCHAR(128), COMPANY_CODE VARCHAR(48))");
                sql.execute("INSERT INTO company_code_master VALUES ('QA Service Operations', 'QA-A'), ('QA Second Company', 'QA-B')");
                sql.execute("CREATE TABLE TICKET (T_ID VARCHAR(500), T_REQUESTER VARCHAR(128), T_COMPANY VARCHAR(128), STATUS VARCHAR(500))");
                sql.execute("CREATE TABLE TICKET_TRACKING (SR_NO INT PRIMARY KEY, T_ID VARCHAR(500), ACTIVITY_DATE VARCHAR(500), STATUS VARCHAR(500), MESSAGE VARCHAR(500), TICKET_RAISED_NAME VARCHAR(128), TICKET_RAISED_NAME_COMPANY VARCHAR(128))");
                sql.execute("INSERT INTO TICKET VALUES ('INC-381','alex','QA Service Operations','Assigned'), ('INC-409','alex','QA Service Operations','Resolved'), ('INC-434','alex','QA Service Operations','Assigned'), ('INC-381','alex','QA Second Company','Closed'), ('INC-402','sms','QA Service Operations','New')");
                sql.execute("INSERT INTO TICKET_TRACKING VALUES"
                    + " (1,'INC-381','31-10-2026 16:12:00','New','Requester reported a loan laptop unable to connect to Wi-Fi.','alex','QA Service Operations'),"
                    + " (2,'INC-381','03-11-2026 09:18:00','Assigned','Assigned to Workplace Support for Wi-Fi diagnostics.','alex','QA Service Operations'),"
                    + " (3,'INC-409','02-11-2026 11:40:00','Resolved','VPN access restored for the purchase approval portal.','alex','QA Service Operations'),"
                    + " (4,'INC-381','04-11-2026 10:20:00','Closed','Second company activity.','alex','QA Second Company'),"
                    + " (5,'INC-402','05-11-2026 10:20:00','New','Activity from another requester in the same company.','sms','QA Service Operations'),"
                    + " (6,'INC-402','05-11-2026 10:20:00','New','Tracking mistakenly names a different requester than the incident.','alex','QA Service Operations'),"
                    + " (7,'INC-434','date unavailable','Assigned',NULL,'alex','QA Service Operations'),"
                    + " (8,'INC-381','03-11-2026 09:18:00','Assigned','Workplace Support scheduled the Wi-Fi diagnostics.','alex','QA Service Operations')");
                try (PreparedStatement incident = connection.prepareStatement("INSERT INTO TICKET VALUES (?,'phone','QA Service Operations','New')");
                     PreparedStatement history = connection.prepareStatement("INSERT INTO TICKET_TRACKING VALUES (?,?,'01-11-2026 09:18:00','New',NULL,'phone','QA Service Operations')")) {
                    for (int i = 21; i < 42; i++) {
                        String id = "INC-QA-" + i;
                        incident.setString(1, id);
                        incident.addBatch();
                        history.setInt(1, i);
                        history.setString(2, id);
                        history.addBatch();
                    }
                    incident.executeBatch();
                    history.executeBatch();
                }
                for (String resource : new String[]{"/var/schema.sql", "/var/schema-projects.sql", "/var/schema-tasks.sql"}) {
                    try (InputStream stream = QA.class.getResourceAsStream(resource); Scanner schema = new Scanner(stream, "UTF-8").useDelimiter("\\A")) {
                        for (String statement : schema.next().split(";")) if (!statement.trim().isEmpty()) sql.execute(statement);
                    }
                }
                String hash = secrets.passwordHash(PASSWORD);
                seed(connection, 1, "alex", "Alex Rao", "Sales Manager", "Non-AD", "alex@fixture.invalid", "+12025550101", "QA Service Operations", "QA-A", "off", hash, null, true);
                seed(connection, 2, "alex", "Alex Kim", "Engineer", "Non-AD", "alex-b@fixture.invalid", "+12025550102", "QA Second Company", "QA-B", "off", secrets.passwordHash("Second-company-fixture-only"), null, true);
                seed(connection, 3, "sms", "Nina Shah", "Ticket Co-ordinator", "Non-AD", "nina@fixture.invalid", "+12025550103", "QA Service Operations", "QA-A", "sms", hash, null, true);
                seed(connection, 4, "enroll", "Dev Singh", "Developer", "Non-AD", "dev@fixture.invalid", "+12025550104", "QA Service Operations", "QA-A", "totp", hash, null, true);
                seed(connection, 5, "totp", "Noor Paul", "Engineer", "Non-AD", "noor@fixture.invalid", "+12025550105", "QA Service Operations", "QA-A", "totp", hash, secrets.encryptTotp(5, TOTP), true);
                seed(connection, 6, "directory", "Maya Sen", "Engineer", "AD", "dir@fixture.invalid", "+12025550106", "QA Service Operations", "QA-A", "off", null, null, true);
                seed(connection, 7, "disabled", "Ari Shah", "Sales Manager", "Non-AD", "ari@fixture.invalid", "+12025550107", "QA Service Operations", "QA-A", "off", hash, null, false);
                seed(connection, 8, "phone", "Gia Gupta", "Engineer", "Non-AD", "gia@fixture.invalid", "+12025550108", "QA Service Operations", "QA-A", "off", hash, null, true);
                sql.execute("UPDATE LOGINMASTER SET LOCATION='Pune', BRANCH='West office', DEPARTMENT='Commercial operations', SUB_DEPARTMENT='Delivery' WHERE LOGINID=1");
                sql.execute("UPDATE LOGINMASTER SET LOCATION='Chennai', BRANCH='South office', DEPARTMENT='Engineering' WHERE LOGINID=2");
                sql.execute("CREATE TABLE ProjectData (SR_NO INT PRIMARY KEY, PROJECTNAME VARCHAR(500), CUSTOMERNAME VARCHAR(500), FUNCTION_NAME VARCHAR(500), RESPONSIBILITY VARCHAR(500), PRODUCTSUIT VARCHAR(500), PRODUCTTOOL VARCHAR(500), Task_ID VARCHAR(500))");
                sql.execute("INSERT INTO ProjectData VALUES"
                    + " (41,'Purchase Approval Rollout','Riverside Works','Workflow configuration','Implementation planning','SCM Operations','Purchasing','PM-1041'),"
                    + " (43,'Workplace Wi-Fi Upgrade','Orchard Logistics','Site readiness','Survey and handover','Service Operations','Network Inventory','PM-1043'),"
                    + " (44,'VPN 100% Coverage','Riverside Works','Access rollout','Service desk transition','Service Operations','VPN Access','PM-1044'),"
                    + " (51,'Warehouse Inventory','Valley Logistics','Stock control','Warehouse onboarding','SCM Operations','Stock Review','PM-1051'),"
                    + " (52,'Unassigned Project','Valley Logistics',NULL,NULL,NULL,NULL,NULL)");
                sql.execute("INSERT INTO scm_mobile_project_access VALUES (1,'QA-A',41), (1,'QA-A',43), (1,'QA-A',44), (2,'QA-B',51), (1,'QA-B',52)");
                sql.execute("CREATE TABLE requirementDocument (SR_NO INT PRIMARY KEY, rd_id VARCHAR(120), RDStatus VARCHAR(120), Date VARCHAR(120))");
                sql.execute("CREATE TABLE UnderstandingDocument (SR_NO INT PRIMARY KEY, ud_id VARCHAR(120), UDStatus VARCHAR(120), Date VARCHAR(120))");
                sql.execute("CREATE TABLE ProjectKickOfMeeting (SR_NO INT PRIMARY KEY, Status VARCHAR(120), Date VARCHAR(120), TypesMeeting VARCHAR(120))");
                sql.execute("INSERT INTO requirementDocument VALUES (61,'RD-61','RD Approved By MD','12-11-2026'), (62,'RD-62','Submitted','15-11-2026'), (63,'RD-63','Submitted','16-11-2026')");
                sql.execute("INSERT INTO UnderstandingDocument VALUES (71,'UD-71','UD Approved By MD','13-11-2026')");
                sql.execute("INSERT INTO ProjectKickOfMeeting VALUES (81,'Meeting Scheduled','19-11-2026 10:00','Video conference')");
                sql.execute("INSERT INTO scm_mobile_project_record VALUES (44,'QA-A','requirement',61), (44,'QA-A','understanding',71), (44,'QA-A','kickoff',81), (44,'QA-B','requirement',62), (51,'QA-B','requirement',63)");
                sql.execute("CREATE TABLE DaywiseTask (SR_NO INT PRIMARY KEY, STATUS VARCHAR(120), CUSTOMERNAME VARCHAR(120), PRODUCTSUIT VARCHAR(120), PRODUCTTOOL VARCHAR(120), DESCRIPTION VARCHAR(2000), MODULE_NAME VARCHAR(120), TEAM_LEADER VARCHAR(120), DEVELOPER_NAME VARCHAR(120), START_DATE VARCHAR(120), END_DATE VARCHAR(120), ASSIGNBY VARCHAR(128))");
                sql.execute("INSERT INTO DaywiseTask VALUES"
                    + " (201,'Pending','Riverside Works','Service Operations','VPN Access','Check access policies for the first pilot group.','Pilot readiness','Dev Singh','Noor Paul','16.11.2026','20.11.2026','Alex Rao'),"
                    + " (202,'Completed','Riverside Works','Service Operations','VPN Access','Record baseline connection results.','Connection tests','Dev Singh','Noor Paul','13.11.2026','15.11.2026','Alex Rao'),"
                    + " (203,'Pending','Orchard Logistics',NULL,NULL,'Assigned by a different user.','Different assigner',NULL,NULL,NULL,NULL,'Maya Sen'),"
                    + " (204,'Completed','Valley Logistics',NULL,NULL,'Isolated company queue.','Stock export',NULL,NULL,NULL,NULL,'Alex Kim'),"
                    + " (205,'Pending','Valley Logistics',NULL,NULL,'Grant belongs to another company.','Other company',NULL,NULL,NULL,NULL,'Alex Rao')");
                sql.execute("INSERT INTO scm_mobile_task_access VALUES (1,'QA-A',201), (1,'QA-A',202), (1,'QA-A',203), (2,'QA-B',204), (1,'QA-B',205)");
                sql.execute("ALTER TABLE DaywiseTask ADD updateDate_Status VARCHAR(120)");
                sql.execute("INSERT INTO DaywiseTask (SR_NO,STATUS,CUSTOMERNAME,PRODUCTSUIT,PRODUCTTOOL,DESCRIPTION,MODULE_NAME,TEAM_LEADER,DEVELOPER_NAME,START_DATE,END_DATE,ASSIGNBY,updateDate_Status) VALUES"
                    + " (206,'Pending','Riverside Works','Service Operations','VPN Access','Check the second pilot group before rollout.','Pilot acceptance','Dev Singh','Alex Rao','16.11.2026','20.11.2026','Maya Sen','Date Approved'),"
                    + " (207,'Pending','Riverside Works',NULL,NULL,NULL,'Date revision requested',NULL,'Alex Rao',NULL,NULL,'Maya Sen','Date Requested'),"
                    + " (208,'Completed','Riverside Works',NULL,NULL,NULL,'Closed task',NULL,'Alex Rao',NULL,NULL,'Maya Sen',NULL),"
                    + " (209,'Pending','Riverside Works',NULL,NULL,NULL,'Different developer',NULL,'Alex Kim',NULL,NULL,'Maya Sen',NULL)");
                sql.execute("INSERT INTO scm_mobile_task_access VALUES (1,'QA-A',206), (1,'QA-A',207), (1,'QA-A',208), (1,'QA-A',209)");
                sql.execute("CREATE TABLE Update_Todays_Progress (SR_NO INT PRIMARY KEY, TASK_ID VARCHAR(120), DATE VARCHAR(120), TODAYS_PROGRESS VARCHAR(2000), STATUS VARCHAR(120), FULL_NAME VARCHAR(120), TASK_TYPE VARCHAR(120))");
                sql.execute("INSERT INTO Update_Todays_Progress VALUES"
                    + " (301,'206','16.11.2026','Verified pilot accounts and recorded rollout exceptions.','In-Progress','Alex Rao','General'),"
                    + " (302,'206','16.11.2026','Other workflow using the same task reference.','In-Progress','Maya Sen','RFP'),"
                    + " (303,'204','16.11.2026','Other company work log.','In-Progress','Alex Kim','General')");
                try (PreparedStatement project = connection.prepareStatement("INSERT INTO ProjectData (SR_NO, PROJECTNAME) VALUES (?, 'Paging test project')");
                     PreparedStatement access = connection.prepareStatement("INSERT INTO scm_mobile_project_access VALUES (8,'QA-A',?)")) {
                    for (int id = 100; id < 133; id++) {
                        project.setInt(1, id);
                        project.addBatch();
                        access.setInt(1, id);
                        access.addBatch();
                    }
                    project.executeBatch();
                    access.executeBatch();
                }
            }
            AuthService.Directory directory = (company, username, password) -> "QA-A".equals(company) && "directory".equals(username) && "Synthetic-AD-only-22".equals(password);
            AuthService.Delivery deliver = (channel, destination, code) -> {
                try {
                    synchronized (inbox) {
                        Files.write(inbox, (channel + "\t" + destination + "\t" + code + "\n").getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                    }
                } catch (java.io.IOException e) { throw new AuthService.Unavailable(); }
            };
            return new AuthService(new Accounts(db), secrets, directory, deliver, clock);
        }

        @Bean public AuthController stageController(AuthService auth) { return new LoopbackController(auth); }
    }

    @Configuration @EnableWebMvc @Import({AuthController.class, AuthConfiguration.class})
    public static class ProductionProfile {}

    @org.springframework.web.bind.annotation.RestController
    @org.springframework.web.bind.annotation.RequestMapping("/mobile/v1/auth")
    public static class LoopbackController extends AuthController { LoopbackController(AuthService auth) { super(auth, true); } }

    private static void seed(Connection db, int id, String username, String displayName, String role, String directory, String email, String phone,
                             String company, String code, String method, String hash, String totp, boolean enabled) throws Exception {
        try (PreparedStatement identity = db.prepareStatement("INSERT INTO LOGINMASTER (LOGINID, USERNAME, FULL_NAME, ROLE_TYPE, DESIGNATION, LOGIN_TYPE, EMAIL, PHONE, COMPANY) VALUES (?,?,?,?,?,?,?,?,?)")) {
            identity.setInt(1, id); identity.setString(2, username); identity.setString(3, displayName); identity.setString(4, role);
            identity.setString(5, "Operations"); identity.setString(6, directory); identity.setString(7, email); identity.setString(8, phone);
            identity.setString(9, company); identity.executeUpdate();
        }
        try (PreparedStatement profile = db.prepareStatement("INSERT INTO scm_mobile_account (LOGIN_ID,COMPANY_CODE,ENABLED,PASSWORD_HASH,MFA_MODE,TOTP_ENCRYPTED) VALUES (?,?,?,?,?,?)")) {
            profile.setInt(1, id); profile.setString(2, code); profile.setBoolean(3, enabled); profile.setString(4, hash);
            profile.setString(5, method); profile.setString(6, totp); profile.executeUpdate();
        }
    }
}
