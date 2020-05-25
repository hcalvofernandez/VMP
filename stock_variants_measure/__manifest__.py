# -*- coding: utf-8 -*-
{
    'name': 'Stock por variantes y medida',
    'description': "",
    'author': "",
    'website': "",
    'summary': "",
    'version': '0.1',
    "license": "OPL-1",
    'support': '',
    'category': 'Stock',
        # any module necessary for this one to work correctly
    'depends': ['base', 'product','stock', 'sale', 'purchase'],

    # always loaded
    'data': [
             'views/templates.xml',             
             'views/views.xml',
            ],
    #'qweb': ['static/src/xml/*.xml'],
    'installable': True,
}
