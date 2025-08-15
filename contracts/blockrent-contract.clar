;; blockrent-contract
;; Decentralized property rental smart contract
;; Handles escrow deposits, rent payments, late fees, and automated lease terminations

;; constants
(define-constant CONTRACT-OWNER "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM")
(define-constant ESCROW-FEE-RATE u25) ;; 0.25% escrow fee
(define-constant LATE-FEE-RATE u50) ;; 0.5% daily late fee
(define-constant MAX-LATE-DAYS u30) ;; Maximum days before lease termination
(define-constant SECONDS-PER-DAY u86400)

;; data maps and vars
(define-data-var property-counter uint u0)
(define-data-var lease-counter uint u0)

;; Property data - split into separate maps for Clarity compatibility
(define-map property-owners uint principal)
(define-map property-addresses uint (string-ascii 200))
(define-map property-rents uint uint)
(define-map property-deposits uint uint)
(define-map property-availability uint bool)
(define-map property-descriptions uint (string-ascii 500))
(define-map property-creation-times uint uint)

;; Lease data - split into separate maps for Clarity compatibility
(define-map lease-properties uint uint)
(define-map lease-tenants uint principal)
(define-map lease-rents uint uint)
(define-map lease-deposits uint uint)
(define-map lease-start-dates uint uint)
(define-map lease-end-dates uint uint)
(define-map lease-last-payments uint uint)
(define-map lease-escrow-balances uint uint)
(define-map lease-late-fees uint uint)
(define-map lease-statuses uint (string-ascii 20))

;; Escrow and payment tracking
(define-map escrow-balances uint uint)
(define-map rent-payment-counters uint uint)
(define-map rent-payments uint (tuple
  (lease-id uint)
  (amount uint)
))

