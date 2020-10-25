# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
{
    'name' : 'Purchase Order Automation',
    'version' : '1.0',
    'author':'Craftsync Technologies',
    'category': 'purchase',
    'maintainer': 'Craftsync Technologies',
    'summary': """Enable auto purchase workflow with purchase order confirmation. Include operations like Auto Create Supplier Bill, Auto Create Bill and Auto Transfer Delivery Order.""",
    'website': 'https://www.craftsync.com/',
    'license': 'OPL-1',
    'support':'info@craftsync.com',
    'depends' : ['purchase','stock'],
    'data': [
        'views/res_config_settings_views.xml',
    ],
    
    'installable': True,
    'application': True,
    'auto_install': False,
    'images': ['static/description/main_screen.png'],
    'price': 19.00,
    'currency': 'EUR',

}
