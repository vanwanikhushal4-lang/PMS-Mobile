import unittest

from scm_inventory import source_routes


class SourceRoutesTest(unittest.TestCase):
    def test_reports_routes_aliases_methods_and_actual_views(self):
        source = '''
        @RequestMapping("/PMS")
        public class PMSController {
            // @RequestMapping("/commented")
            @RequestMapping(value = { "/tasks", "/work" }, method = {RequestMethod.GET, RequestMethod.POST})
            public String tasks() {
                /* return "NotUsed"; */
                if (enabled()) return "/Pms/TaskList";
                return "success";
            }
        }
        '''
        routes = list(source_routes('PMSController.java', source, {'Pms/TaskList.jsp', 'NotUsed.jsp'}))
        self.assertEqual({(r['method'], r['route']) for r in routes}, {
            ('GET', '/PMS/tasks'), ('POST', '/PMS/tasks'), ('GET', '/PMS/work'), ('POST', '/PMS/work'),
        })
        self.assertTrue(all(r['views'] == ['Pms/TaskList.jsp'] and r['handler'] == 'tasks' for r in routes))

    def test_preserves_path_variables_and_methods_without_explicit_method(self):
        source = '''
        public class TicketController {
            @GetMapping("/ticket/{id}")
            public String ticket() { return "Ticket"; }
            @RequestMapping("/reset")
            public void clear() {}
        }
        '''
        routes = list(source_routes('TicketController.java', source, {}))
        self.assertEqual([(r['method'], r['route']) for r in routes], [('GET', '/ticket/{id}'), ('ANY', '/reset')])
        self.assertEqual(routes[0]['views'], [])
