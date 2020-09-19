# -*- coding: utf-8 -*-
{
    'name': 'Origin and Application of Resources',
    'description': "Allow viewing and recording information about cash sales application and source flow",
    'author': "Jorge Luis López Ricardo",
    'website': "",
    'summary': """
    """,
    'version': '0.1',
    "license": "",
    'support': '',
    'category': 'Account',
    'depends': ['base', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'views/search_views_account_move.xml',
        'views/actions.xml',
        'views/account_move_kanban.xml',
        'views/origin_application_settings.xml',
        'views/account_move.xml',
        'data/origin_application_settings_data.xml',
        'data/resources_flow_data.xml',
        'report/origin_application_resources_report.xml',
        'wizard/origin_application_wizard_views.xml',
        'views/menus.xml',
    ],
    'application': True,
    'installable': True,
}