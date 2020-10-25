# -*- coding: utf-8 -*-
{
    'name': "mendocinos_copy_products",

    'summary': """
        Copia todos los productos de "Mendocinos Madero" a "Mendocinos Tampico".
    """,

    'description': """
        Copia todos los productos de "Mendocinos Madero" a "Mendocinos Tampico".
    """,

    'author': "Odoo Experts MX",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/12.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Technical Settings',
    'version': '12.0.1.0.0',

    # any module necessary for this one to work correctly
    'depends': ['product', 'fabricacion_insumos', 'base_product_inventory'],

    "post_init_hook": "post_init_hook",
}
