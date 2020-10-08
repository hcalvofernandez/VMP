{
    'name': 'Update Base Product Cost',
    'version': '0.1',
    'summary': 'Update the base product cost based in the last purchase',
    'description': 'Update the base product',
    'depends': ['base', 'base_product_inventory'],
    'installable': True,
    'auto_install': False,
    'post_init_hook': 'update_base_product_cost',
}