from odoo import fields, models, api


class ProductTemplate (models.Model):
    _inherit = 'product.template'

    base_standard_price = fields.Float(string="Base Standard Price", company_dependent=True)


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.multi
    def button_confirm(self):
        res = super(PurchaseOrder, self).button_confirm()
        if res:
            for order in self:
                for line in order.order_line:
                    template_id = line.product_id.product_tmpl_id
                    template_id.write({"base_standard_price": line.price_unit})
        return res

