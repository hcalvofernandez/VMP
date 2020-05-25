# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models

_logger = logging.getLogger(__name__)

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    theme_selector = fields.Selection(selection_add=[
        ('gray_scale', 'Escala de Grises')
    ])