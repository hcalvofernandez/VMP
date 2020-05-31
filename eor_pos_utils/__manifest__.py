# -*- coding: utf-8 -*-

{
    'name': 'Pos Utilities',
    'version': '1.0',
    'description': 'Utilidades POS',
    'summary': 'Cambios POS Odoo Experts',
    'author': 'Edgardo Ortiz <edgardoficial.yo@gmail.com>',
    'website': 'https://github.com/eortizromero/',
    'license': 'LGPL-3',
    'category': 'Odoo Experts',
    'depends': [
        'base',
        'point_of_sale',
        'flexibite_com_advance',
    ],
    'data': [
        'security/ir.model.access.csv',
        'views/res_partner_view.xml',
        'views/account_cash_view.xml',
        'views/account_journal_view.xml',
        'views/eor_pos_templates.xml',
        'views/pos_session_view.xml',
        'views/contract_view.xml',
    ],
    'qweb': ['static/src/xml/*.xml'],
    'auto_install': True,
    'application': True,
}