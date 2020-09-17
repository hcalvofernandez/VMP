# -*- coding: utf-8 -*-
{
    'name': 'Origin and Application of Resources',
    'description': "Allow view and register information about cash flow",
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
        'views/account_move_kanban.xml',
        'views/origin_application_settings.xml',
        'views/menus.xml',
        'data/origin_application_settings_data.xml',
        'data/resources_flow_data.xml',
    ],
    'application': True,
    'installable': True,
}