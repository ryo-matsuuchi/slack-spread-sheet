class SettingsError extends Error {
  constructor(message, userId) {
    super(message);
    this.name = "SettingsError";
    this.userId = userId;
  }
}

class OperationError extends Error {
  constructor(message, userId, operation) {
    super(message);
    this.name = "OperationError";
    this.userId = userId;
    this.operation = operation;
  }
}

module.exports = {
  SettingsError,
  OperationError
};