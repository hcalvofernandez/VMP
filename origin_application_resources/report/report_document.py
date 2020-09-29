# -*- coding: utf-8 -*-

from odoo import models, api, _
from odoo.exceptions import ValidationError

from datetime import datetime


class ReportDocument(models.AbstractModel):
    _name = "report.origin_application_resources.report_document"

    @api.model
    def _get_report_values(self, docids, data=None):
        model_data = self._get_data(data["liquidation_periods"], data['last_date'])
        data.update(model_data)
        return data

    @api.model
    def _get_data(self, periods, last_date):
        context = self._context.copy()
        context['periods'] = periods
        flow = self.env["origin_application_resources.resources_flow"].with_context(context).search([])
        flow._compute_total()
        data = {}
        for rec in flow:
            data[rec.type] = {
                "settled": rec.total_settled,
                "value": rec.total,
                "to_settle": rec.diff,
                'percent': rec.percent_in_origin,
            }
        data.update({'pays': self.get_applications(periods),
                     'origins': self.get_origins(periods),
                     'last_date': last_date, })
        return data

    @api.model
    def get_applications(self, periods):
        application_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").application_journal_ids
        if not application_journals:
            raise Warning("Please, set the journals in the configuration")
        account_ids = application_journals.mapped('default_credit_account_id.id')
        domain = [('journal_id', 'in', application_journals.ids), ('oar_type', '=', 'application'),
                  ('account_id', 'in', account_ids), ('move_state', '=', 'posted'),
                  ('liquidation_id', 'in', periods), ]
        return self.env['account.move.line'].search(domain)

    @api.model
    def get_origins(self, periods):
        origin_journals = self.with_context({'force_company': self.env.user.company_id.id}).env.ref(
            "origin_application_resources.general_settings_data").origin_journal_ids
        if not origin_journals:
            return [{"total": 0, "total_pending": 0}]
        account_ids = origin_journals.mapped("default_debit_account_id.id")
        origin_total_sql = """SELECT 
                                am.date,
                                am.ref,
                                SUM(aml.balance) AS balance
                                FROM account_move_line AS aml
                                INNER JOIN account_move AS am ON am.id = aml.move_id
                                WHERE am.journal_id IN (%s)
                                AND aml.account_id IN (%s)
                                AND am.company_id = %s
                                AND am.is_settled IN (true,false)
                                AND am.oar_type = 'origin'
                                AND am.state = 'posted'
                                AND am.liquidation_id IN (%s)
                                GROUP BY am.ref, am.date
                                """ % (str(origin_journals.ids)[1:-1], str(account_ids)[1:-1],
                                       str(self.env.user.company_id.id), str(periods)[1:-1])
        self.env.cr.execute(origin_total_sql)
        result = self.env.cr.dictfetchall()
        return result

    # @api.model
    # def get_details_applications(self, start_date, end_date):
    #     application_journals = self.env.ref(
    #         "origin_application_resources.general_settings_data").application_journal_ids
    #     account_ids = application_journals.mapped("default_debit_account_id.id")
    #     account_ids += application_journals.mapped("default_credit_account_id.id")
    #     if not application_journals:
    #         raise ValidationError(_("Please, set the journals in the configuration"))
    #     application_details_sql = """SELECT
    #                                 aaa.name AS name,
    #                                 rp.name AS vendor,
    #                                 SUM(aml.debit - aml.credit) AS vals
    #                                 FROM account_move_line AS aml
    #                                 INNER JOIN account_move AS am ON am.id = aml.move_id
    #                                 INNER JOIN account_analytic_account AS aaa ON aaa.id = aml.analytic_account_id
    #                                 INNER JOIN res_partner AS rp ON rp.id = aaa.partner_id
    #                                 WHERE am.journal_id IN (%s)
    #                                 AND aml.account_id IN (%s)
    #                                 AND am.company_id = %s
    #                                 AND am.date >= '%s'
    #                                 AND am.date <= '%s'
    #                                 AND am.state = 'posted'
    #                                 GROUP BY aaa.name, rp.name
    #                                 """ % (str(application_journals.ids)[1:-1], str(account_ids)[1:-1],
    #                                        str(self.env.user.company_id.id),
    #                                        start_date, end_date)
    #     self.env.cr.execute(application_details_sql)
    #     vals = self.env.cr.dictfetchall()
    #     return {"application_details": vals}
    #
    # @api.model
    # def get_vendor_applications(self, start_date, end_date):
    #     application_journals = self.env.ref(
    #         "origin_application_resources.general_settings_data").application_journal_ids
    #     account_ids = application_journals.mapped("default_debit_account_id.id")
    #     account_ids += application_journals.mapped("default_credit_account_id.id")
    #     if not application_journals:
    #         raise ValidationError(_("Please, set the journals in the configuration"))
    #     application_details_sql = """SELECT
    #                                     aml.date AS move_date,
    #                                     rp.name AS vendor,
    #                                     ai.number AS invoice,
    #                                     ABS(SUM(aml.balance)) AS vals
    #                                     FROM account_move_line AS aml
    #                                     INNER JOIN account_move AS am ON am.id = aml.move_id
    #                                     LEFT JOIN res_partner AS rp ON rp.id = aml.partner_id
    #                                     LEFT JOIN account_invoice AS ai ON ai.id = aml.invoice_id
    #                                     WHERE am.journal_id IN (%s)
    #                                     AND aml.account_id IN (%s)
    #                                     AND am.company_id = %s
    #                                     AND am.date >= '%s'
    #                                     AND am.date <= '%s'
    #                                     AND am.oar_type = 'application'
    #                                     AND am.state = 'posted'
    #                                     GROUP BY ai.number, rp.name, aml.date
    #                                     """ % (str(application_journals.ids)[1:-1], str(account_ids)[1:-1],
    #                                            str(self.env.user.company_id.id),
    #                                            start_date, end_date)
    #     self.env.cr.execute(application_details_sql)
    #     vals = self.env.cr.dictfetchall()
    #     return {"application_details": vals}

