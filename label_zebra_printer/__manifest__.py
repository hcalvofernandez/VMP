# -*- coding: utf-8 -*-
#################################################################################
# Author      : Kanak Infosystems LLP. (<http://kanakinfosystems.com/>)
# Copyright(c): 2012-Present Kanak Infosystems LLP.
# All Rights Reserved.
#
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#
# You should have received a copy of the License along with this program.
# If not, see <http://kanakinfosystems.com/license>
#################################################################################

{
    'name': 'Label Printing From Zebra Printer',
    'version': '1.1',
    'category': 'Printer',
    'summary': 'An app which helps to send labels directly to the zebra label printer',
    'description': """
This module provides to print product,location and shipping label from Zebra Printer
====================================================================================

    """,
    'license': 'OPL-1',
    'author': 'Kanak Infosystems LLP.',
    'website': 'http://www.kanakinfosystems.com',
    'depends': ['sale_stock', 'barcodes'],
    'data': [
        'views/zebra_printer_view.xml',
        'views/res_company_view.xml',
        'views/res_config_settings_views.xml',
    ],
    'images': ['static/description/banner.jpg'],
    'installable': True,
    'price': 50,
    'currency': 'EUR',
    'live_test_url': 'https://www.youtube.com/watch?v=O8OVx2GxuGM',

}
