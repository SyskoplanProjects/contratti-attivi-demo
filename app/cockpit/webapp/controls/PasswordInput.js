sap.ui.define([
	'sap/m/InputBase',
	"sap/m/Input",
	'sap/m/library',
	'sap/ui/core/IconPool',
	'sap/ui/Device',
], function (InputBase, Input, library, IconPool, Device) {
	"use strict";

	// shortcut for sap.m.InputType
	var InputType = library.InputType;

	var oPasswordInput = Input.extend("com.buyerui.buyerui.controls.PasswordInput", {
		metadata: {
			properties: {
				type: {
					type: "sap.m.InputType",
					group: "Data",
					defaultValue: InputType.Password
				}
			},
			aggregations: {
				_showPasswordIcon: {
					type: "sap.ui.core.Icon",
					multiple: false,
					visibility: "hidden"
				}
			},
			events: {
				showPassword: {
					parameters: {
						key: {
							type: "string",
							defaultValue: "test"
						}
					}
				}
			}
		},

		renderer: "sap.m.InputRenderer"
	});

	/**
	 * Initializes the control.
	 *
	 * @private
	 */
	oPasswordInput.prototype.init = function () {
		Input.prototype.init.call(this);
		this._showPassword = false;
	};

	/**
	 * Overwrites the onBeforeRendering.
	 *
	 * @public
	 */
	oPasswordInput.prototype.onBeforeRendering = function () {
		var sSelectedKey = this.getSelectedKey(),
			bShowIcon = true,
			aEndIcons = this.getAggregation("_endIcon") || [],
			oIcon = aEndIcons[0];

		InputBase.prototype.onBeforeRendering.call(this);

		this._deregisterEvents();

		if (sSelectedKey) {
			this.setSelectedKey(sSelectedKey);
		}

		if (bShowIcon) {
			// ensure the creation of an icon
			oIcon = this._getIconShowPassword();
			oIcon.setProperty("visible", true, true);
		}

		!this.getWidth() && this.setWidth("100%");
		// Unregister custom event handlers after migration to semantic rendering
		this.$().off("click");
	};

	oPasswordInput.prototype._getIconShowPassword = function () {
		var that = this,
			aEndIcons = this.getAggregation("_endIcon") || [],
			oShowPasswordIcon = aEndIcons[0];

		// for backward compatibility - leave this method to return the instance
		if (!oShowPasswordIcon) {
			oShowPasswordIcon = this.addEndIcon({
				id: this.getId() + "-vhi",
				src: IconPool.getIconURI("hide"),
				useIconTooltip: false,
				noTabStop: true,
				press: function (oEvent) {
					var oParent = this.getParent(),
						$input;

					if (Device.support.touch) {
						// prevent opening the soft keyboard
						$input = oParent.$('inner');
						$input.attr('readonly', 'readonly');
						oParent.focus();
						$input.removeAttr('readonly');
					} else {
						oParent.focus();
					}
					if (that._showPassword) {
						that._showPassword = false;
						that.setProperty("type", "Password");
					} else {
						that._showPassword = true;
						that.setProperty("type", "Text");
					}
				}
			});
		}

		oShowPasswordIcon.setProperty("src", this._showPassword ? IconPool.getIconURI("show") : IconPool.getIconURI("hide"));

		return oShowPasswordIcon;
	};

	oPasswordInput.prototype.onfocusout = function (oEvent) {
		Input.prototype.onfocusout.apply(this, arguments);
		this._showPassword = false;
		this.setProperty("type", "Password");
	};

	return oPasswordInput;

});