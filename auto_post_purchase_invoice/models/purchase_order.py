from odoo import models, api


class PurchaseOrder(models.Model):
    _inherit = 'purchase.order'

    @api.multi
    def action_view_invoice(self):
        res = super(PurchaseOrder, self).action_view_invoice()
        if self._context.get('create_bill', False):
            context = res['context']
            values = {}
            for key in context.keys():
                new_key = key
                if new_key.startswith('default_'):
                    new_key = new_key.replace('default_', '')
                values.update({new_key: context[key]})
            invoice = self.env['account.invoice'].create(values)
            invoice.purchase_order_change()
            invoice._onchange_partner_id()
            invoice.compute_taxes()
            invoice._compute_amount()
            invoice.action_invoice_open()
            res['res_id'] = invoice.id
        return res
