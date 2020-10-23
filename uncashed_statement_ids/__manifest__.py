# -*- coding: utf-8 -*-
{
    'name': "uncashed_statement_ids",

    'summary': """
        Short (1 phrase/line) summary of the module's purpose, used as
        subtitle on modules listing or apps.openerp.com""",

    'description': """
        Long description of module's purpose
    """,

    'author': "Odoo Experts MX",

    # Categories can be used to filter modules in modules listing
    # Check https://github.com/odoo/odoo/blob/12.0/odoo/addons/base/data/ir_module_category_data.xml
    # for the full list
    'category': 'Point Of Sale',
    'version': '12.0.1.0.0',

    # any module necessary for this one to work correctly
    'depends': ['flexibite_com_advance', 'origin_application_resources'],

    # always loaded
    'data': [
        'views/point_of_sale.xml',
    ],
}
