# -*- coding: utf-8 -*-
{
    'name': "from_jaropamex_copy_expensed_product",

    'summary': """
        Copia todos los productos que pueden ser comprados y ser un gasto de Jaropamex a Mendocinos 31 y 09.
    """,

    'description': """
        Copia todos los productos que pueden ser comprados y ser un gasto de Jaropamex a Mendocinos 31 y 09.
    """,

    'author': "Odoo Experts MX",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/12.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Technical Settings',
    'version': '12.0.1.0.0',

    # any module necessary for this one to work correctly
    'depends': ['product', 'hr_expense', 'base_product_inventory'],

    "post_init_hook": "post_init_hook",
}
