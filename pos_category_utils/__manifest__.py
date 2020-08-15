# -*- coding: utf-8 -*-

{
    'name': 'Pos Category Utilities',
    'version': '1.0',
    'description': 'POS Utilities',
    'summary': 'POS Categories Utilities Odoo Experts',
    'author': '',
    'website': '',
    'license': 'LGPL-3',
    'category': 'Odoo Experts',
    'depends': [
        'base',
        'point_of_sale',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/pos_config_views.xml',
        'views/templates.xml',
    ],
    'qweb': [],
    'auto_install': False,
    'application': False,
}