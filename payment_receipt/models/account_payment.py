from odoo import fields, models, api


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    print_receipt = fields.Boolean(string='Print Receipt', default=True)

    def action_validate_invoice_payment(self):
        res = super(AccountPayment, self).action_validate_invoice_payment()
        if self.print_receipt:
            return self.print_payment_receipt()
        return res

    def print_payment_receipt(self):
        return self.env.ref('payment_receipt.payment_receipt_report').report_action(self, data={},
                                                                                    config=False)




