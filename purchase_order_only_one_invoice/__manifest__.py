# -*- coding: utf-8 -*-
{
    'name': "purchase_order_only_one_invoice",

    'summary': """
        Evita que en las "Solicitudes de presupuesto" se creen más de una factura.
    """,

    'description': """
        Evita que en las "Solicitudes de presupuesto" se creen más de una factura.
    """,

    'author': "Odoo Experts MX",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/12.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Purchases',
    'version': '12.0.1.0.0',

    # any module necessary for this one to work correctly
    'depends': ['purchase'],

    # always loaded
    'data': [
        'views/views.xml',
    ],
}