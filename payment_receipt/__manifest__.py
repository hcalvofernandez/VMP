{
    'name': 'Payment Receipt',
    'version': '0.1',
    'summary': 'Report to print the payment receipt of vendor bills',
    'description': 'Report to print the payment receipt of vendor bills',
    'category': 'report',
    'author': 'Odoo Experts',
    'depends': ['account'],
    'data': ['report/payment_receipt.xml',
             'views/account_payment.xml', ],
    'installable': True,
    'auto_install': False
}