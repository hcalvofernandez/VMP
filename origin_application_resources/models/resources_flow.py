# -*- coding: utf-8 -*-

from odoo import models, fields, api, _

from odoo.exceptions import ValidationError


class Account_Move(models.Model):
    _inherit = "account.move"

    is_settled = fields.Boolean(string="Is Settled", default=False)
    liquidation_id = fields.Many2one("origin_application_resources.resources_flow", string="Liquidation")

    @api.onchange("liquidation_id")
    def onchange_liquidation_id(self):
        if not self.liquidation_id:
            return {}
        lines = self.env["account.move.line"]
        data = {
            "account_id": self._context.get("liquidation_debit_account"),
            "debit": self._context.get("liquidation_value"),
        }
        data2 = {
            "account_id": self._context.get("liquidation_credit_account"),
            "credit": self._context.get("liquidation_value"),
        }
        self.line_ids += lines.new(data)
        self.line_ids += lines.new(data2)

    @api.multi
    def post(self, invoice=False):
        res = super(Account_Move, self).post(invoice)
        if self.liquidation_id:
            settings = self.env.ref("origin_application_resources.general_settings_data")
            liquidation_journal = settings.liquidation_journal_id
            if liquidation_journal and self.journal_id.id == liquidation_journal.id:
                self.validate_liquidation(settings)
        return res

    @api.multi
    def validate_liquidation(self, settings):
        if not settings.application_journal_ids or not settings.origin_journal_ids:
            raise ValidationError(_("Please, set the journals in configuration"))
        account_ids = settings.liquidation_journal_id.mapped("default_credit_account_id.id")
        liquidation = self.env.ref("origin_application_resources.liquidation_flow_data")
        lines = self.line_ids.filtered(lambda s: s.account_id.id in account_ids)
        sum = 0
        for line in lines:
            sum += line.credit - line.debit
        if sum != liquidation.diff:
            raise ValidationError(_("The value to settle must be equal to the sum of the accounting entries."))
        else:
            self.write({'is_settled': True})
            journals = settings.origin_journal_ids.ids + settings.application_journal_ids.ids
            move_ids = self.get_move_ids(journals)
            account_move = self.env['account.move'].search([('id', '=', move_ids)])
            account_move.write({
                'is_settled': True,
            })

    @api.multi
    def get_move_ids(self, journals):
        sql = """SELECT
                am.id AS id
                FROM account_move AS am
                WHERE am.journal_id IN (%s)
                AND am.company_id = %s
                AND am.is_settled = false
                AND am.state = 'posted'
            """ % (str(journals)[1:-1], str(self.env.user.company_id.id))
        self.env.cr.execute(sql)
        values = self.env.cr.dictfetchall()
        ids = [i['id'] for i in values]
        return ids


class ResourcesFlow(models.Model):
    _name = "origin_application_resources.resources_flow"
    _description = "manage the origin and application of resources"

    color = fields.Integer(string="Color Index")
    type = fields.Selection([('origin', "Resources Origin"),
                             ('application', "Resources Application"),
                             ('liquidation', "Liquidation")], string="Type")
    total_settled = fields.Float(compute="_compute_total", string="Total Settled")
    total = fields.Float(compute="_compute_total", string="Total")
    diff = fields.Float(compute="_compute_total", string="Difference")
    percent_in_origin = fields.Float(compute="_compute_total", string="percent")

    @api.model
    def _compute_total(self):
        for rec in self:
            if rec.type == "origin":
                result = rec.get_origin_total()
                rec.total_settled = result[0]['total']-result[0]['total_pending']
                rec.total = result[0]['total']
                rec.diff = result[0]['total_pending']
                if result[0]['total_pending'] > 0:
                    rec.percent_in_origin = 100.0
            elif rec.type == "application":
                origin = rec.get_origin_total()[0]['total_pending']
                result = rec.get_applications_total()
                rec.total_settled = result[0]['total']-result[0]['total_pending']
                rec.total = result[0]['total']
                rec.diff = result[0]['total_pending']
                if origin and origin > 0:
                    rec.percent_in_origin = rec.diff/origin*100
            elif rec.type == "liquidation":
                origin = rec.get_origin_total()
                application = rec.get_applications_total()
                liquidation = rec.get_liquidation_total()
                rec.total_settled = liquidation[0]['total'] - liquidation[0]['total_pending']
                rec.total = origin[0]["total"] - application[0]["total"]
                rec.diff = origin[0]["total_pending"] - application[0]["total_pending"]
                if origin[0]["total_pending"] > 0:
                    rec.percent_in_origin = rec.diff/origin[0]["total_pending"]*100


    @api.model
    def get_origin_total(self):
        origin_journals = self.env.ref(
            "origin_application_resources.general_settings_data").origin_journal_ids
        if not origin_journals:
            return [{"total": 0, "total_pending": 0}]
        account_ids = origin_journals.mapped("default_debit_account_id.id")
        origin_total_sql = """SELECT
                                SUM(aml.debit - aml.credit) AS total,
                                SUM(CASE WHEN am.is_settled = false THEN aml.debit - aml.credit ELSE 0 END) 
                                AS total_pending
                                FROM account_move_line AS aml
                                INNER JOIN account_move AS am ON am.id = aml.move_id
                                WHERE am.journal_id IN (%s)
                                AND aml.account_id IN (%s)
                                AND am.company_id = %s
                                AND am.is_settled IN (true,false)
                                AND am.state = 'posted'
                            """ % (str(origin_journals.ids)[1:-1], str(account_ids)[1:-1],
                                   str(self.env.user.company_id.id))
        if "start_date" in self.env.context:
            origin_total_sql += """AND am.date >= '%s'
            AND am.date <= '%s'
            """ % (self._context.get("start_date"), self._context.get("end_date"))
        self.env.cr.execute(origin_total_sql)
        result = self.env.cr.dictfetchall()
        if not result[0]['total']:
            result[0]['total'] = 0
        if not result[0]['total_pending']:
            result[0]['total_pending'] = 0
        return result

    @api.model
    def get_applications_total(self):
        application_journals = self.env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids
        if not application_journals:
            return [{"total": 0, "total_pending": 0}]
        account_ids = application_journals.mapped("default_credit_account_id.id")
        application_total_sql = """SELECT
                                SUM(aml.credit-aml.debit) AS total,
                                SUM(CASE WHEN am.is_settled = false THEN aml.credit-aml.debit ELSE 0 END) 
                                AS total_pending
                                FROM account_move_line AS aml
                                INNER JOIN account_move AS am ON am.id = aml.move_id
                                WHERE am.journal_id IN (%s)
                                AND aml.account_id IN (%s)
                                AND am.company_id = %s
                                AND am.is_settled IN (true, false)
                                AND am.state = 'posted'
                            """ % (str(application_journals.ids)[1:-1], str(account_ids)[1:-1],
                                   str(self.env.user.company_id.id))
        if "start_date" in self.env.context:
            application_total_sql += """AND am.date >= '%s'
            AND am.date <= '%s'
            """ % (self._context.get("start_date"), self._context.get("end_date"))
        self.env.cr.execute(application_total_sql)
        result = self.env.cr.dictfetchall()
        if not result[0]['total']:
            result[0]['total'] = 0
        if not result[0]['total_pending']:
            result[0]['total_pending'] = 0
        return result

    @api.model
    def get_liquidation_total(self):
        liquidation_journal = self.env.ref(
            "origin_application_resources.general_settings_data").liquidation_journal_id
        if not liquidation_journal:
            return [{"total": 0, "total_pending": 0}]
        account_ids = [liquidation_journal.default_credit_account_id.id, ]
        application_total_sql = """SELECT
                                    SUM(aml.credit - aml.debit) AS total,
                                    SUM(CASE WHEN am.is_settled = false THEN aml.credit - aml.debit ELSE 0 END) 
                                    AS total_pending
                                    FROM account_move_line AS aml
                                    INNER JOIN account_move AS am ON am.id = aml.move_id
                                    WHERE am.journal_id = %s
                                    AND aml.account_id IN (%s)
                                    AND am.company_id = %s
                                    AND am.is_settled IN (true, false)
                                    AND am.state = 'posted'
                                """ % (str(liquidation_journal.id), str(account_ids)[1:-1],
                                       str(self.env.user.company_id.id))
        if "start_date" in self.env.context:
            application_total_sql += """AND am.date >= '%s'
                AND am.date <= '%s'
                """ % (self._context.get("start_date"), self._context.get("end_date"))
        self.env.cr.execute(application_total_sql)
        result = self.env.cr.dictfetchall()
        if not result[0]['total']:
            result[0]['total'] = 0
        if not result[0]['total_pending']:
            result[0]['total_pending'] = 0
        return result

    @api.multi
    def open_settings(self):
        action = self.env.ref('origin_application_resources.origin_application_settings_action').read()[0]
        action['name'] = _("Please, configure the journals.")
        action['target'] = 'new'
        return action

    @api.multi
    def settle_pending(self):
        if self.diff < 0:
            raise ValidationError(_("You can not to settle a negative value"))
        settings = self.env.ref("origin_application_resources.general_settings_data")
        if not settings.liquidation_journal_id:
            raise ValidationError(_("Please, configure a liquidation journal."))
        context = {
            "default_liquidation_id": self.id,
            "default_ref": _("Liquidation of Source and Application"),
            "default_journal_id": settings.liquidation_journal_id.id,
            "liquidation_value": self.diff,
            "liquidation_debit_account": settings.liquidation_journal_id.default_debit_account_id.id,
            "liquidation_credit_account": settings.liquidation_journal_id.default_credit_account_id.id,
        }
        return {
            "name": _("Liquidation of Source and Application"),
            "type": 'ir.actions.act_window',
            "res_model": "account.move",
            "view_mode": "form",
            "context": context,
        }

