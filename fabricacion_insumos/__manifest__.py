# -*- coding: utf-8 -*-
{
    'name': 'Insumos - Fabricación',
    'description': "Control de insumos para proceso de productos fabricados.",
    'author': "",
    'website': "",
    'summary': "Control de insumos para proceso de productos fabricados.",
    'version': '0.1',
    "license": "OPL-1",
    'support': '',
    'category': 'Fabricación',
    "images": ["images/banner.png"],
        # any module necessary for this one to work correctly
    'depends': ['base', 'mrp'],

    # always loaded
    'data': [
             'views/templates.xml',             
             'views/views.xml',
            ],
    'qweb': [],
    'installable': True,
}
