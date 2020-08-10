# -*- coding:utf-8 -*-

from odoo import models, fields, api

from datetime import datetime


class ContractContract(models.Model):
    _inherit = "contract.contract"

    count_orders = fields.Integer(string="Órdenes", compute="compute_orders_to_invoice")
    contacts_mail_to = fields.Many2many('res.partner', string='Enviar reporte a')
    auto_send = fields.Boolean(string='Enviar reportes automáticamente')

    @api.multi
    def compute_orders_to_invoice(self):
        for contract in self:
            for line in contract.contract_line_ids:
                partner = contract.partner_id
                partner_ids = partner.mapped('child_ids.id')
                partner_ids.append(partner.id)
                orders = self.env['pos.order'].search_count([('partner_id', 'in', partner_ids),
                                                             ('credit_amount', '>', 0),
                                                             ('state_order_fac', '=', 'n'),
                                                             ('date_order', '>=', line.next_period_date_start),
                                                             ('date_order', '<=', line.next_period_date_end)])
                contract.count_orders = orders

    @api.multi
    def show_orders_to_invoice(self):
        orders = False
        for line in self.contract_line_ids:
            partner = self.partner_id
            partner_ids = partner.mapped('child_ids.id')
            partner_ids.append(partner.id)
            orders = self.env['pos.order'].search([('partner_id', 'in', partner_ids),
                                                   ('credit_amount', '>', 0),
                                                   ('state_order_fac', '=', 'n'),
                                                   ('date_order', '>=', line.next_period_date_start),
                                                   ('date_order', '<=', line.next_period_date_end)])
        return {
            'name': "Órdenes a facturar",
            'type': 'ir.actions.act_window',
            'res_model': "pos.order",
            'view_mode': "tree,form",
            'domain': [('id', 'in', orders.mapped('id'))]
        }

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
    def button_send(self):
        for line in self.contract_line_ids:
            self.send_report(line)

    @api.multi
    def send_report(self, line):
        start_date = line.next_period_date_start
        start_date = datetime(year=start_date.year, month=start_date.month, day=start_date.day,
                                       hour=0, minute=0, second=0)
        end_date = line.next_period_date_end
        end_date = datetime(year=end_date.year, month=end_date.month, day=end_date.day,
                                       hour=23, minute=59, second=59)
        default_values = {
        'start_date': start_date,
        'end_date': end_date,
        'end_date_copy': end_date,
        'company_id': self.partner_id.company_id.id,
        'partner_id': self.partner_id.id,
        'check_mail': True,
        'check_format_date': False,
        'email_to': [(6, 0, self.contacts_mail_to.mapped('id'))],
        }
        self.send_mail_report(default_values)

    @api.model
    def send_mail_report(self, default_values):
        wizard = self.env['credit.report_pos_wizard'].create(default_values)
        context_wizard = self.env.context.copy()
        context_wizard.update({'partner_id': default_values['partner_id']})
        wizard = wizard.with_context(context_wizard)
        action = wizard.get_details()
        wizard.send_mail_report(action)

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
                        new_log = line.invoice_period_log_ids.filtered(lambda log: log.state == 'new')
                        if new_log:
                            new_log.write({'state': 'invoiced'})
                        partner = contract.partner_id
                        partner_ids = partner.mapped('child_ids.id')
                        partner_ids.append(partner.id)
                        orders = self.env['pos.order'].search([('partner_id', 'in', partner_ids),
                                                               ('credit_amount', '>', 0),
                                                               ('state_order_fac', '=', 'n'),
                                                               ('date_order', '>=', line.next_period_date_start),
                                                               ('date_order', '<=', line.next_period_date_end)])
                        if orders:
                            orders.write({'state_order_fac': 'p'})
                            invoice_line_values['quantity'] = 1
                            invoice_line_values['price_unit'] = sum(orders.mapped('credit_amount'))
                            # invoice_line_values['invoice_line_tax_ids'] = [(4, self.env.ref('l10n_mx.3_tax12').id, 0)]
                            invoice_values['invoice_line_ids'].append(
                                (0, 0, invoice_line_values)
                            )
                            invoice_values['pos_order_ids'] = [(6, 0, orders.mapped('id'))]
                            if contract.auto_send:
                                contract.send_report(line)
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
                                                                                  max_date_end, )
        next_period_date_end = self.get_next_period_date_end(
            next_period_date_start,
            recurring_rule_type,
            recurring_interval,
            max_date_end=max_date_end,
        )

        if next_invoice_date:  # Create one record to the model credit.invoice_period_log
            period = self.env['credit.invoice_period_log'].search([('contract_line_id', '=', self.id),
                                                                   ('end_date', '>=', next_period_date_start),
                                                                   ('start_date', '<=', next_period_date_start)])
            if not period:
                if self.contract_id.type_contract == "credito":
                    log = self.env['credit.invoice_period_log']
                    vals = {
                        "start_date": next_period_date_start,
                        "end_date": next_period_date_end,
                        "contract_line_id": self.id,
                    }
                    log.create(vals)
        return next_invoice_date
