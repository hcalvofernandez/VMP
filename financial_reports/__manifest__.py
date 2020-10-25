# -*- coding: utf-8 -*-

{
    'name': 'Trial Balance, Balance Sheet & Profit and Loss Financial Reports',
    'version': '12.0.1.0',
    'summary': 'Print financial reports in PDF and Excel with left right columns pattern like Tally software',
    'author': 'William Peña, Steven Piñero Ogsistemas',
    'website': 'https://Ogsistemas',
    'description': """
        This module is used to configure and generate financial reports like Balance Sheet, Profit and Loss, Trial Balance, General Ledger and Aged Partner Balance. 
        Print Trial Balance, P&L and Balance Sheet in PDF & Excel. Print excel report with left-right column pattern much like Tally accounting software.
        """,
    'images': ['static/description/banner.png'],
    'category': "Accounting",
    'depends': ['account'],
    'data': [
        'security/ir.model.access.csv',
        'views/account_menuitem.xml',
        'views/account_financial_report_data.xml',
        'views/account_view.xml', 
        'wizard/partner_ledger.xml',        
        'views/account_report.xml',
        'wizard/account_report_trial_balance_view.xml',
        'views/report_trialbalance.xml',
        'wizard/account_report_general_ledger_view.xml',
        'views/report_generalledger.xml',
        'wizard/account_financial_report_view.xml',
        'views/report_financial.xml',
        'wizard/account_report_aged_partner_balance_view.xml',        
        'views/report_agedpartnerbalance.xml',
        'report/report_partner_ledger.xml',
    ],
    'installable': True,    
    'auto_install': False,
    'application': True,
    'license': "OPL-1",
    'support': 'odoo@sandv.biz'
}
