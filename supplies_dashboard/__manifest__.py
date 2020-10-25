# -*- coding: utf-8 -*-
{
    'name': 'Supplies Dashboard',
    'version': '0.1',
    'description': 'It show analytic information about the supplies sub-system',
    'summary': '',
    'author': 'Jorge Luis López <jorgeluislr93@gmail.com>',
    'category': 'Dashboard',
    'depends': [
        'base',
        'stock',
        'purchase',
        'flexibite_com_advance',
    ],
    'data': [
        'views/menu_dashboard.xml',
        'views/supplies_dashboard.xml',
    ],
    'qweb': [
        'static/src/xml/*.xml',
    ],
    'application': True,
}
