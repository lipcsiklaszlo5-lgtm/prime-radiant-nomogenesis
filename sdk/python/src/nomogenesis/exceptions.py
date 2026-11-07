"""Exceptions for Nomogenesis Shield SDK."""

from __future__ import annotations


class NomogenesisError(Exception):
    """Base exception for all Nomogenesis Shield SDK errors."""


class RpcError(NomogenesisError):
    """Raised when a NEAR JSON-RPC call fails or times out."""


class ContractError(NomogenesisError):
    """Raised when a smart contract call returns an execution error."""


class VerificationError(NomogenesisError):
    """Raised when cryptographic or data integrity verification fails."""


class PolicyError(NomogenesisError):
    """Raised when an economic policy rejects an operation or payment."""


class ValidationError(NomogenesisError):
    """Raised when input parameters fail schema or boundary validation."""
