from odoo import api, fields, models, exceptions


class PurchaseOrder(models.Model):
    _inherit = "purchase.order"

    @api.multi
    def button_confirm(self):
        imediate_obj=self.env['stock.immediate.transfer']
        invoice_obj = self.env['account.invoice']
        res = super(PurchaseOrder,self).button_confirm()
        for order in self:

            company_id = order.company_id
            if company_id.is_po_delivery_set_to_done and order.picking_ids: 
                for picking in self.picking_ids:
                    picking.action_confirm()
                    picking.action_assign()
                    imediate_rec = imediate_obj.create({'pick_ids': [(4, picking.id)]})
                    imediate_rec.process()

            if company_id.create_invoice_for_po and not order.invoice_ids:
                invoice_id = invoice_obj.create({'purchase_id': order.id, 'partner_id': order.partner_id.id,
                                               'default_type': 'in_invoice', 'type': 'in_invoice',
                                               'journal_type': 'purchase','account_id': order.partner_id.property_account_payable_id.id})
                invoice_id.purchase_order_change()
                invoice_id._onchange_partner_id()
                invoice_id._onchange_invoice_line_ids()

            if company_id.validate_po_invoice and order.invoice_ids:
                for invoice in order.invoice_ids:
                    invoice.action_invoice_open()
            
        return res  
