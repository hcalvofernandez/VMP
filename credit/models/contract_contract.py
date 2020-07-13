# -*- coding:utf-8 -*-

from odoo import models, fields, api


class ContractContract(models.Model):
    _inherit = "contract.contract"

    @api.model
    def is_valid_order_date(self, customer_id):
        today = fields.Date.today()
        partner = self.env['res.partner'].search([('id', '=', customer_id)])
        contract_partner = partner.mapped('contract_ids.id')
        contract_partner.extend(partner.parent_id.mapped('contract_ids.id'))
        contract_ids = self.env['contract.contract'].search([('id', 'in', contract_partner),
                                                            ('type_contract', '=', 'credito'),
                                                            '|', ('date_end', '>', today),
                                                            ('date_end', '=', False),
                                                            ])
        if contract_ids:
            for contract in contract_ids:
                for line in contract.contract_line_ids:
                    if line.next_period_date_end > today:
                        return {'result': True}
        return {'result': False}

    @api.multi
    def _prepare_recurring_invoices_values(self, date_ref=False):
        """
        This method builds the list of invoices values to create, based on
        the lines to invoice of the contracts in self.
        !!! The date of next invoice (recurring_next_date) is updated here !!!
        :return: list of dictionaries (invoices values)
        """
        invoices_values = []
        for contract in self:
            if not date_ref:
                date_ref = contract.recurring_next_date
            if not date_ref:
                # this use case is possible when recurring_create_invoice is
                # called for a finished contract
                continue
            contract_lines = contract._get_lines_to_invoice(date_ref)
            if not contract_lines:
                continue
            invoice_values = contract._prepare_invoice(date_ref)
            for line in contract_lines:
                    invoice_values.setdefault('invoice_line_ids', [])
                    invoice_line_values = line._prepare_invoice_line(
                        invoice_id=False
                    )
                    if invoice_line_values:
                        if contract.type_contract == 'credito':
                            # new_log = line.invoice_period_log_ids.filtered(lambda log: log.state == 'new')
                            # orders = False
                            # if len(new_log) > 0:
                            #     orders = new_log[0].order_ids
                            #     new_log[0].state = 'invoiced'
                            partner = contract.partner_id
                            partner_ids = partner.mapped('child_ids.id')
                            partner_ids.append(partner.id)
                            orders = self.env['pos.order'].search([('partner_id', 'in', partner_ids),
                                                                   ('credit_amount', '>', 0),
                                                                   ('state_order_fac', '=', 'n'),
                                                                   ('date_order', '>=', line.next_period_date_start),
                                                                   ('date_order', '<=', line.next_period_date_end)])
                            sum = 0
                            if orders:
                                for order in orders:
                                    sum += order.credit_amount
                                    order.state_order_fac = 'p'
                                    invoice_line_values['quantity'] = 1
                                    invoice_line_values['price_unit'] = sum

                                invoice_values['invoice_line_ids'].append(
                                    (0, 0, invoice_line_values)
                                )
                        else:
                            invoice_values['invoice_line_ids'].append(
                                (0, 0, invoice_line_values)
                            )


            invoices_values.append(invoice_values)
            contract_lines._update_recurring_next_date()
        return invoices_values



class CreditContractLine(models.Model):
    _inherit = "contract.line"

    invoice_period_log_ids = fields.One2many('credit.invoice_period_log', 'contract_line_id', string="Ids Periodos")

    @api.model
    def get_next_invoice_date(
            self,
            next_period_date_start,
            recurring_invoicing_type,
            recurring_invoicing_offset,
            recurring_rule_type,
            recurring_interval,
            max_date_end,
    ):
        next_invoice_date = super(CreditContractLine, self).get_next_invoice_date(next_period_date_start,
                                                                                     recurring_invoicing_type,
                                                                                     recurring_invoicing_offset,
                                                                                     recurring_rule_type,
                                                                                     recurring_interval,
                                                                                     max_date_end,)
        next_period_date_end = self.get_next_period_date_end(
            next_period_date_start,
            recurring_rule_type,
            recurring_interval,
            max_date_end=max_date_end,
        )
        if next_invoice_date:# Create one record to the model credit.invoice_period_log
            if self.contract_id.type_contract == "credito":
                log = self.env['credit.invoice_period_log']
                vals = {
                    "start_date": next_period_date_start,
                    "end_date": next_period_date_end,
                    "contract_line_id": self.id,
                }
                log.create(vals)
        return next_invoice_date
