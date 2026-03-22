import mapLabeled from "../assets/MapLabeled.jpg";
import mapUnlabeled from "../assets/MapUnlabeled.jpg";

export default function Minimap() {
    return <img
        src={mapLabeled}
        style={{ width: "auto", height: "40vh" }}
        className="rounded shadow border border-5 border-warning"
    />
}