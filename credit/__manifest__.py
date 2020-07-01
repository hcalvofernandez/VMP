#-*- coding: utf-8 -*-
{
    'name': "Credit Schemes",
    'summary': """
        module for credit schemes
    """,
    'description': """
        module for credit schemes
    """,
    'author': "Francisco Castillo Moo",
    'website': "",
    'version': '0.1',
    "license": "OPL-1",
    'depends': [
        'base',
        'contract',
        'point_of_sale',
        #'flexibite_com_advance',
        #'eor_pos_utils',
        'mail',
        'contacts',
    ],
    'data': [
        'security/ir.model.access.csv',
        'wizard/report_pos_wizard_views.xml',
        'wizard/report_pos_wizard_individual_views.xml',
        'report/credit_summary_report.xml',
        'data/mail_template_report.xml',
        'views/credit_schemes_views.xml',
        'views/contract_contract_views.xml',
        'views/res_company_views.xml',
        'views/detail_credit_partner_views.xml',
        'views/pos_config_views.xml',
        'report/credit_summary_template.xml',
        'report/credit_summary_invididual_report.xml',
        'report/credit_summary_invididual_template.xml',

        ],
    'installable': True,
    'application': True,
    'auto_install': False,
}

