from odoo import api, SUPERUSER_ID


def update_base_product_cost(cr, registry):
    env = api.Environment(cr, SUPERUSER_ID, {})
    company_ids = env['res.company'].search([])
    for company in company_ids:
        purchase_lines = env['purchase.order.line'].with_context({
            'force_company': company.id}).search([], order="id asc")
        for pl in purchase_lines:
            template_id = pl.product_id.product_tmpl_id
            template_id.write({"standard_price": pl.price_unit})
