# -*- coding: utf-8 -*-
{
    'name': "restrict_supplier_creation",

    'summary': """
        Restringe la creación de proveedores.
    """,

    'description': """
        Restringe la creación de proveedores.
    """,

    'author': "Odoo Experts MX",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/12.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Extra Rights',
    'version': '12.0.1.0.0',

    # any module necessary for this one to work correctly
    'depends': ['base'],

    # always loaded
    'data': [
        'security/groups.xml',
        'security/account_rules.xml',
    ],
}
