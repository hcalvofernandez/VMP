# -*- coding: utf-8 -*-

import logging

from odoo import _, api, fields, models

_logger = logging.getLogger("______________________________________________________" + __name__)


class ComputerEquipment(models.Model):
    _name = 'flexibite_com_advance.computer_equipment'

    name = fields.Char('Nombre', required=True)
    ip = fields.Char('Dirección IP')



