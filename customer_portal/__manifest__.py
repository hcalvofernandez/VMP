# -*- coding: utf-8 -*-

{
    'name': 'Customer Portal',
    'version': '1.0',
    'description': 'Customer Portal',
    'summary': 'Customer Portal',
    'author': '',
    'website': '',
    'license': 'LGPL-3',
    'category': 'Odoo Experts',
    'depends': [
        'base',
        'portal',
        'credit',
        'eor_pos_utils',
        'website',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/templates.xml',
    ],
    'qweb': [],
    'auto_install': False,
    'application': False,
}