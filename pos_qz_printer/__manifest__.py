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
    'name': 'POS Receipt Print By QZ',
    'version': '1.0',
    'category': 'Point of Sale',
    'summary': 'This module allows POS receipt print directly to the printer using QZ',
    'description': """
This module provides to print pos receipt from qz
====================================================================================
With this Odoo Module you can set the QZ printer configuration to print the POS receipt which is not the default functionality In Odoo. Easy to take POS Receipt print from QZ printer. This module allows to choose the print method for POS orders.

* Key Features

* Print entire order on one receipt.

* Get print receipt from your QZ Printer.

* Set the printer configuration.

    """,
    'license': 'OPL-1',
    'author': 'Kanak Infosystems LLP.',
    'images': ['static/description/banner.jpg'],
    'website': 'http://www.kanakinfosystems.com',
    'depends': ['point_of_sale', 'flexibite_com_advance'],
    'data': [
        'views/res_company_view.xml',
        'views/template.xml',
    ],
    'installable': True,
    'price': 30,
    'currency': 'EUR',
    'live_test_url': 'https://youtu.be/0vYQb9VDqC4',
}
