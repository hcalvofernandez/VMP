# -*- coding:utf-8 -*-

from odoo import models, api


class ContractContract(models.Model):
    _inherit = "contract.contract"


class CreditContractLine(models.Model):
    _inherit = "contract.line"

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
