{
    'name': 'Base Product Inventory',
    'description': "Modify the inventory document to include the base product",
    'author': "Jorge Luis Lopez Ricardo",
    'website': "",
    'summary': """
    Allow inventory adjustment using base products instead of product variants. 
    It doesn't modify the odoo flow, it just hides unused views and includes 
    new models and views, and customizes business logic.
    """,
    'version': '0.1',
    "license": "",
    'support': '',
    'category': 'Stock',
    'depends': ['base', 'stock_variants_measure'],

    # always loaded
    'data': [
        'security/ir.model.access.csv',
        'views/stock_inventory.xml',
        # 'data/cron_inventory.xml'
    ],
    #'qweb': ['static/src/xml/*.xml'],
    'installable': True,
}