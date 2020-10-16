# -*- coding: utf-8 -*-

from odoo import api, fields, models, tools


class PosOrderReport(models.Model):
    _name = "report.eor_pos_utils.pos.order.pay"
    _description = "Point of Sale Orders Pay Report"
    _auto = False
    _order = 'date desc'

    date = fields.Datetime(string='Order Date', readonly=True)
    order_id = fields.Many2one('pos.order', string='Order', readonly=True)
    partner_id = fields.Many2one('res.partner', string='Customer', readonly=True)
    state = fields.Selection(
        [('draft', 'New'), ('paid', 'Paid'), ('done', 'Posted'),
         ('invoiced', 'Invoiced'), ('cancel', 'Cancelled')],
        string='Status')
    user_id = fields.Many2one('res.users', string='Salesperson', readonly=True)
    price_total = fields.Float(string='Total Price', readonly=True)
    location_id = fields.Many2one('stock.location', string='Location', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    nbr_lines = fields.Integer(string='Sale Line Count', readonly=True, oldname='nbr')
    journal_id = fields.Many2one('account.journal', string='Journal')
    delay_validation = fields.Integer(string='Delay Validation')
    invoiced = fields.Boolean(readonly=True)
    config_id = fields.Many2one('pos.config', string='Point of Sale', readonly=True)
    session_id = fields.Many2one('pos.session', string='Session', readonly=True)

    def _select(self):
        return """
            SELECT
                MIN(l.id) AS id,
                COUNT(*) AS nbr_lines,
                s.date_order AS date,
                SUM(l.amount) AS price_total,
                SUM(cast(to_char(date_trunc('day',s.date_order) - date_trunc('day',s.create_date),'DD') AS INT)) AS delay_validation,
                s.id as order_id,
                s.partner_id AS partner_id,
                s.state AS state,
                s.user_id AS user_id,
                s.location_id AS location_id,
                s.company_id AS company_id,
                l.journal_id AS journal_id,
                ps.config_id,
                s.pricelist_id,
                s.session_id,
                s.invoice_id IS NOT NULL AS invoiced
        """

    def _from(self):
        return """
            FROM account_bank_statement_line AS l
                LEFT JOIN pos_order s ON (s.id=l.pos_statement_id)
                LEFT JOIN pos_session ps ON (s.session_id=ps.id)
        """

    def _where(self):
        return """
            WHERE s.company_id IS NOT NULL
        """

    def _group_by(self):
        return """
            GROUP BY
                s.id, s.date_order, s.partner_id,s.state, l.journal_id,
                s.user_id, s.location_id, s.company_id, s.sale_journal,
                s.pricelist_id, s.invoice_id, s.create_date, s.session_id,
                ps.config_id
        """

    @api.model_cr
    def init(self):
        tools.drop_view_if_exists(self._cr, self._table)
        self._cr.execute("""
            CREATE OR REPLACE VIEW %s AS (
                %s
                %s
                %s
                %s
            )
        """ % (self._table, self._select(), self._from(), self._where(), self._group_by())
        )


