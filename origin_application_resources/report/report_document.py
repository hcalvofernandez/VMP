# -*- coding: utf-8 -*-

from odoo import models, api


class ReportDocument(models.AbstractModel):
    _name = "report.origin_application_resources.report_document"

    @api.model
    def _get_report_values(self, docids, data=None):
        model_data = self._get_data(data["liquidation_id"])
        data.update(model_data)
        return data

    @api.model
    def _get_data(self, liquidation):
        liquidation_id = self.env['origin_application_resources.liquidation_log'].browse(liquidation)
        data = {
            'liquidation': liquidation_id,
            'origins': self.get_origins(liquidation, liquidation_id.company_id.id),
            'pays': liquidation_id.application_to_settle
        }
        return data

    @api.model
    def get_origins(self, liquidation, company_id):
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
                                AND aml.liquidation_origin_id = %s
                                GROUP BY am.ref, am.date
                                """ % (str(origin_journals.ids)[1:-1], str(account_ids)[1:-1],
                                       str(company_id), str(liquidation))
        self.env.cr.execute(origin_total_sql)
        result = self.env.cr.dictfetchall()
        return result
