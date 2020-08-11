# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class ResCompany(models.Model):
    _inherit = 'res.company'


class PosOrder(models.Model):
    _inherit = 'pos.order'

    invoice_id = fields.Many2one('account.invoice', string="Factura")
    period_log_id = fields.Many2one("credit.invoice_period_log", string="Periodo de la orden")
    state_order_fac = fields.Selection([
        ('n', 'Nuevo'),
        ('p', 'Proceso'),
        ('f', 'Facturado'),
        ('paid', "Pagado")],
        string='Estado Factura',
        default='paid'
    )

    @api.model
    def create(self, values):
        order = super(PosOrder, self).create(values)
        if order.credit_amount > 0:
            order.state_order_fac = 'n'
            ids_ = order.mapped('partner_id.contract_ids.id') or order.mapped(
                'partner_id.parent_id.contract_ids.id')
            contract_line_ids = self.env['contract.line'].search([
                ('contract_id', 'in', ids_)
            ])
            invoice_period_log = self.env['credit.invoice_period_log'].search([
                ('contract_line_id', 'in', contract_line_ids.mapped("id"))],
            )
            current_period_log = invoice_period_log.filtered(
                lambda logs: logs.start_date == logs.contract_line_id.next_period_date_start and
                             logs.end_date == logs.contract_line_id.next_period_date_end
            )
            current_period_log.write({'order_ids': [(4, order.id)]})
        return order

    @api.multi
    def write(self, values):
        result = super(PosOrder, self).write(values)
        for order in self:
            if order.credit_amount > 0:
                if not order.period_log_id:
                    if order.state_order_fac == 'paid':
                        order.state_order_fac = 'n'
                    ids_ = order.mapped('partner_id.contract_ids.id') or order.mapped(
                        'partner_id.parent_id.contract_ids.id')
                    contract_line_ids = self.env['contract.line'].search([
                        ('contract_id', 'in', ids_)
                    ])
                    invoice_period_log = self.env['credit.invoice_period_log'].search([
                        ('contract_line_id', 'in', contract_line_ids.mapped("id"))],
                    )
                    current_period_log = invoice_period_log.filtered(
                        lambda logs: logs.start_date == logs.contract_line_id.next_period_date_start and
                                     logs.end_date == logs.contract_line_id.next_period_date_end
                    )
                    current_period_log.write({'order_ids': [(4, order.id)]})
        return result
