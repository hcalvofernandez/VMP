# -*- coding: utf-8 -*-

from odoo import models, fields, api, tools, _
import logging


_logger = logging.getLogger('_______________________________________________________'+__name__)


class CustomerPortalSession(models.Model):
    _name = 'customer_portal.session'

    partner_id = fields.Many2one('res.partner', string='Cliente', required=True)
    session_token = fields.Char('Token', required=True)
    odoo_session_token = fields.Char('Odoo session', required=True)
