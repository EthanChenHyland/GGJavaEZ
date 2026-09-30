package audit.dispatch.model;

public final class ParcelDelivery extends AbstractDelivery {
    private final int weight;

    public ParcelDelivery(int weight) {
        super(5);
        this.weight = weight;
    }

    @Override public String kind() {
        return "parcel";
    }

    @Override public int charge() {
        return baseFee() + 2 * weight;
    }
}
