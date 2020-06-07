# -*- coding:utf-8 -*-
from odoo import models, fields, api
from odoo.exceptions import ValidationError

import logging

_logger = logging.getLogger(__name__)


class PosConfig(models.Model):
    _inherit = 'pos.config'


    imagen = fields.Binary(
        string='Imagen',
        attachment=True,
    )