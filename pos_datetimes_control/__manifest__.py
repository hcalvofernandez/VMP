# -*- coding: utf-8 -*-
{
    'name': "Pos Control DateTimes",

    'summary': """
        Permite controlar sesiones de pos por fecha incio y fin a nivel multicomañia""",

    'description': """
        Long description of module's purpose
    """,

    'author': "Alexander Grisales",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/12.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Point of Sale',
    'version': '0.1',

    # any module necessary for this one to work correctly
    'depends': ['base','point_of_sale'],

    # always loaded
    'data': [
        # 'security/ir.model.access.csv',
        'views/html_header.xml',
        'views/res_company.xml',
        'views/pos_config.xml',
        'views/pos_session.xml',        
        'views/ir_cron.xml', 
    ],
    # only loaded in demonstration mode
    'demo': [
        'demo/demo.xml',
    ],
}