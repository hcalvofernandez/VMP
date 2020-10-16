# -*- coding: utf-8 -*-

{
    'name': 'Restricción de visualización de menús',
    'version': '1.0',
    'description': 'Restricción de visualización de menús',
    'summary': 'Restricción de visualización de menús',
    'author': '',
    'website': '',
    'license': 'LGPL-3',
    'category': 'Odoo Experts',
    'depends': [
        'base',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/res_users_views.xml',
    ],
    'qweb': [],
    'auto_install': False,
    'application': False,
    'post_init_hook': 'post_init',
}