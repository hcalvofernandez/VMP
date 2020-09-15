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
        'views/menus.xml',
        'views/origin_application_settings.xml',
        'data/origin_application_settings_data.xml',
    ],
    'application': True,
    'installable': True,
}