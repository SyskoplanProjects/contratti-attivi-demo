sap.ui.define([
	"com/buyerui/buyerui/controller/interfaces/AbstractInterface",
	"sap/ui/richtexteditor/RichTextEditor"
], function (AbstractInterface, RichTextEditor) {
	"use strict";

	var ValidationInterface = {
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/* =========================================================== */
		/* private functions                                           */
		/* =========================================================== */
		_configurableValidationMinMaxValue: function (sValue, oFieldAttributes, oControl, bIsBigger) {
			var sModelName = oFieldAttributes.modelName;
			var oComponent = this.getOwnerComponent();
			var oConfigurationModel = oComponent.getModel(sModelName);
			var isBlocking = typeof oFieldAttributes.isBlocking === "string" ?
				oConfigurationModel.getProperty("/" + oFieldAttributes.isBlocking + "/value") :
				!!oFieldAttributes.isBlocking; //used to avoid undefined cases, in case is undefined it means is not blocking
			var sValueToCompare = oConfigurationModel.getProperty("/" + oFieldAttributes.configurationValue + "/value");
			var bCheck = false;
			if (bIsBigger) {
				bCheck = Number(sValueToCompare) > Number(sValue);
			} else {
				bCheck = Number(sValueToCompare) < Number(sValue);
			}
			if (oFieldAttributes.message && !bCheck) {
				var oResourceBundle = this.getResourceBundle();
				var sMessage = oResourceBundle.getText(oFieldAttributes.message, [sValueToCompare]);
				oControl.setValueStateText(sMessage);
			}

			if (isBlocking) {
				return !bCheck;
			} else {
				return false;
			}
		},

		_checkField: function (oControl, oFieldAttributes) {

			var bCheck = false;
			if (oControl) {
				var bVisible = oControl.getVisible();
			} else {
				bVisible = oFieldAttributes.visible;
			}
			var bMandatory = oFieldAttributes.mandatory;
			var oRegExp;
			var oMessageManager = sap.ui.getCore().getMessageManager();
			var oMessageModel = oMessageManager.getMessageModel();
			var aMessages = oMessageModel.getProperty("/");
			var oMessage;

			if (oFieldAttributes && oFieldAttributes.view) {
				bVisible = oFieldAttributes.view.visible;
				bMandatory = oFieldAttributes.view.mandatory;
			}

			if (oControl && oFieldAttributes && bVisible) {
				oControl.resetProperty("valueStateText");

				if (oFieldAttributes && oFieldAttributes.maxValue) {
					var sValue = oControl.getValue();
					if (oFieldAttributes.maxValue === "CONFIGURATION") {
						bCheck = this._configurableValidationMinMaxValue(sValue, oFieldAttributes, oControl, true);
					} else {
						bCheck = oFieldAttributes.maxValue > sValue;

						bCheck = !bCheck;
					}
				}

				if (oFieldAttributes && oFieldAttributes.minValue !== undefined) {
					var sValue = oControl.getValue();
					if (oFieldAttributes.minValue === "CONFIGURATION") {
						bCheck = this._configurableValidationMinMaxValue(sValue, oFieldAttributes, oControl, false);
					} else {
						bCheck = oFieldAttributes.minValue < sValue;

						bCheck = !bCheck;
					}
				}

				if (oFieldAttributes && oFieldAttributes.maxLength) {
					var sValue = oControl.getValue();
					bCheck = oFieldAttributes.maxLength >= sValue.length;
					var oResourceBundle = this.getResourceBundle();
					bCheck = !bCheck;
				}

				if (oFieldAttributes && oFieldAttributes.regex && !bCheck) {
					oRegExp = new RegExp(oFieldAttributes.regex);
					if (oControl instanceof sap.m.Text || oControl instanceof sap.m.Label) {
						bCheck = oRegExp.test(oControl.getText().trim());
					} else if (oControl instanceof sap.m.Input || oControl instanceof sap.m.TextArea) {
						bCheck = oRegExp.test(oControl.getValue().trim()) || oControl.getValue().trim().length === 0;
					}
					bCheck = !bCheck;
				}

				if (bMandatory && !bCheck) {
					if (oControl instanceof sap.m.Text || oControl instanceof sap.m.Label) {
						bCheck = oControl.getText().trim() === "";
					} else if (oControl instanceof sap.m.Input || oControl instanceof sap.m.TextArea || oControl instanceof RichTextEditor) {
						bCheck = oControl.getValue().trim() === "";
					} else if (oControl instanceof sap.m.StepInput) {
						bCheck = oControl.getValue().toString().trim() === "" || oControl.getValue() === 0;
					} else if (oControl instanceof sap.m.MultiInput) {
						bCheck = oControl.getTokens().length === 0;
					} else if (oControl instanceof sap.m.Select) {
						bCheck = oControl.getSelectedKey() === "";
					} else if (oControl instanceof sap.m.MultiComboBox) {
						bCheck = oControl.getSelectedKeys().length === 0;
					} else if (oControl instanceof sap.m.DatePicker || oControl instanceof sap.m.DateTimePicker) {
						bCheck = oControl.getBindingInfo("value").binding.getValue() === "" ||
							oControl.getBindingInfo("value").binding.getValue() === null ||
							oControl.getBindingInfo("value").binding.getValue() === undefined;
					} else if (oControl instanceof sap.m.ComboBox) {
						bCheck = oFieldAttributes.mandatorySelection === false ? oControl.getValue() === "" : oControl.getSelectedKey() === "";
					}
				}
			}
			return bCheck;
		},

		/* =========================================================== */
		/* public functions                                            */
		/* =========================================================== */
		checkStep: function (sConfigModel, sStepId, sFieldId) {
			var bValid = true;
			var bNotValidField = false;
			var bApplyFocus = true;
			var oConfigModel = this.getView().getModel(sConfigModel);
			var oFieldsAttributes = oConfigModel.getProperty("/fieldsAttributes");
			var oFieldsComposition = oConfigModel.getProperty("/fieldsComposition");

			var oStepConfig = oFieldsComposition.find(function (oStep) {
				return sStepId.indexOf(oStep.stepId) !== -1;
			});

			var fnError = function (oControl) {
				bValid = false;
				if (oControl.setValueState) {
					oControl.setValueState("Error");
					if (bApplyFocus) {
						oControl.focus();
						bApplyFocus = false;
					}
				}
			};
			var fnSuccess = function (oControl) {
				if (oControl.setValueState) {
					oControl.setValueState("None");
				}
			};

			var oControl,
				oControlFields;

			if (oStepConfig && oStepConfig.fields) {

				if (!sFieldId) {

					oStepConfig.fields.forEach(function (sSingleField) {

						oControlFields = sap.ui.getCore().byId(sSingleField);
						if (oControlFields === undefined) {
							oControlFields = this.getView().byId(sSingleField);
						}
						if (oControlFields && oControlFields.setValueState) {
							oControlFields.setValueState("None");
						}

						if (!bNotValidField) {
							oControl = oControlFields;
							bNotValidField = this._checkField(oControl, oFieldsAttributes[sSingleField]);
						}
					}, this);

				} else {

					oControl = sap.ui.getCore().byId(sFieldId);
					if (oControl === undefined) {
						oControl = this.getView().byId(sFieldId);
					}
					bNotValidField = this._checkField(oControl, oFieldsAttributes[sFieldId]);
				}

				if (bNotValidField) {
					fnError(oControl);
				} else {
					fnSuccess(oControl);
				}
			}
			return bValid;
		}

	};

	AbstractInterface.extend(ValidationInterface);

	return ValidationInterface;
});